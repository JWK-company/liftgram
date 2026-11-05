// 피드백 규칙(SPEC-032) — 운영 피드백은 운영진만, 사용자 의견은 로그인한 앱 사용자가 쓴다. 둘은 섞이지 않는다.
//
// 본문은 신뢰할 수 없는 입력이다. 나중에 승인 뒤 자동 수정으로 이을 때도 입력은 승인자의 지시이고,
// 원문은 데이터로만 다룬다. 그래서 승인은 그 순간의 본문 해시와 승인자의 메모를 함께 남긴다.
package feedback

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/access"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	KindOps  = "ops"
	KindUser = "user"

	StatusNew        = "new"
	StatusApproved   = "approved"
	StatusRejected   = "rejected"
	StatusInProgress = "in_progress"
	StatusDone       = "done"

	// 사용자 의견 상한. 계정당 하루 건수와 본문 길이.
	userDailyLimit = 5
	userMaxBody    = 2000
	userMinBody    = 2
	listLimit      = 200
	// 처리 끝난 사용자 의견을 두는 기간.
	closedRetention = 365 * 24 * time.Hour
)

var (
	adminRoles = []string{"admin"}
	platforms  = map[string]bool{"web": true, "android": true, "ios": true}
	semverRe   = regexp.MustCompile(`^\d{1,4}\.\d{1,4}\.\d{1,6}$`)

	// 상태 전이표. 표에 없는 이동은 거절한다. 완료는 끝이다.
	transitions = map[string][]string{
		StatusNew:        {StatusApproved, StatusRejected, StatusInProgress, StatusDone},
		StatusApproved:   {StatusRejected, StatusInProgress, StatusDone},
		StatusInProgress: {StatusRejected, StatusDone},
		StatusRejected:   {StatusNew},
	}
)

// Entry 는 저장된 한 건이다.
type Entry struct {
	ID         int64
	Kind       string
	AuthorID   string
	AuthorName string
	Category   string
	Title      string
	Body       string
	AppVersion string
	Platform   string
	Status     string
	Resolution string
	CreatedAt  time.Time
}

// NewEntry 는 새로 쌓을 한 건이다.
type NewEntry struct {
	Kind       string
	AuthorID   string
	Category   string
	Title      string
	Body       string
	AppVersion string
	Platform   string
}

// Change 는 상태 변경의 결과로 저장할 값이다. 승인이면 ApprovedBodySHA256 이 차 있다.
type Change struct {
	To                 string
	Note               string
	ApprovedBodySHA256 string
}

// Repo 는 저장소다.
type Repo interface {
	access.RoleReader
	// 메일이 없는 소셜 계정은 확인된 것으로 친다(신고 자동 숨김과 같은 기준).
	EmailConfirmed(ctx context.Context, userID string) (bool, error)
	Create(ctx context.Context, e NewEntry) (int64, error)
	// 사용자 잠금 안에서 세고 넣는다 — 동시 요청이 상한을 넘지 못한다. 넘으면 limited=true.
	CreateUserLimited(ctx context.Context, e NewEntry, since time.Time, limit int) (id int64, limited bool, err error)
	List(ctx context.Context, kind string, limit int32) ([]Entry, error)
	// 행을 잠그고 decide 의 결과를 저장한 뒤 감사 기록을 남긴다. 없으면 errs.NotFound.
	ApplyStatus(ctx context.Context, id int64, actorID string, decide func(Entry) (Change, error)) (Entry, error)
	PurgeClosedUser(ctx context.Context, before time.Time) (int64, error)
}

// Service 는 피드백 규칙이다.
type Service struct {
	repo Repo
	now  func() time.Time
}

func NewService(repo Repo, now func() time.Time) *Service { return &Service{repo: repo, now: now} }

// SubmitOps 는 운영 피드백을 쌓는다. 옛 설치본의 Submit 도 여기로 온다.
func (s *Service) SubmitOps(ctx context.Context, viewerID, role, category, title, detail string) (int64, error) {
	if err := access.Require(ctx, s.repo, viewerID, role, adminRoles...); err != nil {
		return 0, err
	}
	title, detail = clean(title), clean(detail)
	// 계약은 trim 이전 길이를 본다 — 공백만 적힌 입력은 여기서 걸린다.
	if len([]rune(title)) < minTitle || len([]rune(detail)) < minDetail {
		return 0, errs.New(errs.Validation, "제목이나 내용이 너무 짧습니다")
	}
	if _, ok := categoryPrefix[category]; !ok {
		return 0, errs.New(errs.Validation, "분류를 골라 주세요")
	}
	return s.repo.Create(ctx, NewEntry{Kind: KindOps, AuthorID: viewerID, Category: category, Title: title, Body: detail})
}

// SubmitUser 는 사용자 의견을 쌓는다. 역할과 무관하게 로그인만 보고, kind 는 언제나 user 다.
func (s *Service) SubmitUser(ctx context.Context, viewerID, body, appVersion, platform string) (int64, error) {
	if viewerID == "" {
		return 0, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	body = clean(body)
	if n := len([]rune(body)); n < userMinBody || n > userMaxBody {
		return 0, errs.New(errs.Validation, "의견은 %d자 이상 %d자 이내로 적어 주세요", userMinBody, userMaxBody)
	}
	confirmed, err := s.repo.EmailConfirmed(ctx, viewerID)
	if err != nil {
		return 0, err
	}
	if !confirmed {
		return 0, errs.New(errs.Forbidden, "메일 확인을 마친 뒤 보낼 수 있어요")
	}
	// 자유 문자열이 쌓이지 않게 형식이 맞는 값만 남긴다.
	if !semverRe.MatchString(appVersion) {
		appVersion = ""
	}
	if !platforms[platform] {
		platform = ""
	}
	id, limited, err := s.repo.CreateUserLimited(ctx, NewEntry{
		Kind: KindUser, AuthorID: viewerID, Body: body, AppVersion: appVersion, Platform: platform,
	}, s.now().Add(-24*time.Hour), userDailyLimit)
	if err != nil {
		return 0, err
	}
	if limited {
		return 0, errs.New(errs.ResourceExhausted, "의견은 하루 %d건까지 보낼 수 있어요. 내일 다시 보내 주세요", userDailyLimit)
	}
	return id, nil
}

// ListEntries 는 운영자 페이지 목록이다. 작성자 이름은 관리자에게만 준다.
func (s *Service) ListEntries(ctx context.Context, viewerID, role, kind string) ([]Entry, error) {
	if err := access.Require(ctx, s.repo, viewerID, role, adminRoles...); err != nil {
		return nil, err
	}
	if kind != KindOps && kind != KindUser {
		return nil, errs.New(errs.Validation, "종류를 골라 주세요")
	}
	entries, err := s.repo.List(ctx, kind, listLimit)
	if err != nil {
		return nil, err
	}
	// 토큰이 아니라 DB 역할로 가른다 — 관리자에서 협업자로 내려간 사람의 옛 토큰에 이름이 나가지 않게.
	if access.Require(ctx, s.repo, viewerID, role, adminRoles...) != nil {
		for i := range entries {
			entries[i].AuthorName = ""
		}
	}
	return entries, nil
}

// SetStatus 는 처리 상태를 바꾼다. 관리자만. 승인은 아무것도 실행하지 않는다.
func (s *Service) SetStatus(ctx context.Context, viewerID, role string, id int64, to, note string) (Entry, error) {
	if err := access.Require(ctx, s.repo, viewerID, role, adminRoles...); err != nil {
		return Entry{}, err
	}
	note = clean(note)
	return s.repo.ApplyStatus(ctx, id, viewerID, func(cur Entry) (Change, error) {
		if !canMove(cur.Status, to) {
			return Change{}, errs.New(errs.Conflict, "이 상태로는 바꿀 수 없습니다")
		}
		c := Change{To: to, Note: note}
		if to == StatusApproved {
			// 나중의 자동 수정은 승인자의 지시만 입력으로 삼는다 — 지시 없는 승인은 받지 않는다.
			if note == "" {
				return Change{}, errs.New(errs.Validation, "승인할 때는 처리 내용을 적어 주세요")
			}
			sum := sha256.Sum256([]byte(cur.Body))
			c.ApprovedBodySHA256 = hex.EncodeToString(sum[:])
		}
		return c, nil
	})
}

// clean 은 앞뒤 공백과 NUL 을 없앤다. PostgreSQL text 는 NUL 을 받지 않아 그대로 두면 사람이 읽을 수 없는 오류가 된다.
func clean(s string) string {
	return strings.TrimSpace(strings.ReplaceAll(s, "\x00", ""))
}

func canMove(from, to string) bool {
	for _, next := range transitions[from] {
		if next == to {
			return true
		}
	}
	return false
}

// PurgeLoop 는 시작할 때와 주기마다 처리 끝난 지 1년 지난 사용자 의견을 지운다.
// 시작 때도 도는 까닭: 배포가 주기보다 잦으면 타이머만으로는 한 번도 돌지 않는다.
func (s *Service) PurgeLoop(ctx context.Context, every time.Duration) {
	s.purgeOnce(ctx)
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			s.purgeOnce(ctx)
		}
	}
}

func (s *Service) purgeOnce(ctx context.Context) {
	if n, err := s.repo.PurgeClosedUser(ctx, s.now().Add(-closedRetention)); err != nil {
		slog.Warn("[feedback] 오래된 의견 삭제 실패", "err", err)
	} else if n > 0 {
		slog.Info("[feedback] 오래된 의견 삭제", "count", n)
	}
}
