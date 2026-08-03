// @plm SRS-020  신고·모더레이션 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것: **무엇을 신고할 수 있고, 누가 검토하고, 내린다는 것이 무슨 뜻인가.**
//
// ── 지키는 규칙 ─────────────────────────────────────────────────────────────
//
//	· **볼 수 있는 것만** 신고할 수 있다. 못 보는 대상은 "없음"으로 답한다 —
//	  신고 창구가 "그 글이 존재하는가"를 알아내는 도구가 되면 안 된다.
//	· 내 것은 신고할 수 없다(지우면 된다).
//	· 같은 사람이 같은 대상을 여러 번 신고해도 **한 건**이다.
//	· 검토는 **역할이 있는 사람만**(moderator·admin).
//	· 제거는 **감추는 것**이다. 행을 지우지 않고, 사진의 바이트까지 막는다 —
//	  "내려갔다"가 참이려면 파일도 안 보여야 한다(ADR-017).
//
// ─────────────────────────────────────────────────────────────────────────────
package moderation

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	maxQueue     = 200
	defaultQueue = 50
	// 큐를 만들 때 훑는 신고의 최대 개수. 이보다 많으면 오래된 것은 다음 회차에 본다.
	reportScanLimit = 500
)

type TargetType string

const (
	TargetPost    TargetType = "post"
	TargetStory   TargetType = "story"
	TargetComment TargetType = "comment"
)

// 사유는 고정 목록이다 — 자유 입력이면 집계도 정책 대응도 못 한다.
var validReasons = map[string]bool{
	"spam": true, "nudity": true, "harassment": true, "violence": true,
	"self_harm": true, "minor_safety": true, "misinformation": true, "other": true,
}

// 검토할 수 있는 역할. 일반 사용자는 큐 자체를 볼 수 없다.
var canModerate = map[string]bool{"moderator": true, "admin": true}

type Author struct {
	ID          string
	DisplayName string
}

type Preview struct {
	Kind     string
	Text     string
	MediaURL string
}

type Target struct {
	AuthorID         string
	ModerationStatus string
	Author           Author
	Preview          Preview
	CreatedAt        time.Time
	// 스토리는 만료가 있다 — 이미 끝난 것은 신고 대상이 아니다.
	ExpiresAt time.Time
	// 댓글은 부모 글의 가시성을 따른다.
	PostID string
}

type Report struct {
	TargetType TargetType
	TargetID   string
	Reason     string
	CreatedAt  time.Time
}

type QueueItem struct {
	TargetType  TargetType
	TargetID    string
	Source      string // "report" 또는 "auto"
	Reasons     []string
	ReportCount int32
	Author      Author
	Preview     Preview
	CreatedAt   time.Time
}

type Repo interface {
	CreateReport(ctx context.Context, id string, t TargetType, targetID, reporterID, reason, details string) error
	ListPendingReports(ctx context.Context, limit int32) ([]Report, error)
	ResolveReports(ctx context.Context, t TargetType, targetID, reviewerID, status, action string) error

	// 없으면 (Target{}, false, nil) — 오류가 아니라 "없음"이다.
	GetTarget(ctx context.Context, t TargetType, targetID string) (Target, bool, error)
	// 글의 가시성 판정에 필요한 최소한.
	PostVisibility(ctx context.Context, postID string) (authorID, visibility, status string, ok bool, err error)
	IsFollowing(ctx context.Context, followerID, followeeID string) (bool, error)

	ListAutoPending(ctx context.Context, limit int32) ([]QueueItem, error)
	// 상태를 바꾸고, 사진이 딸려 있으면 그 바이트도 함께 막거나 푼다(한 트랜잭션).
	SetModeration(ctx context.Context, t TargetType, targetID, status, reason string, removed bool, mediaKey string) error
}

type Service struct {
	repo  Repo
	newID func() string
}

func NewService(repo Repo, newID func() string) *Service {
	return &Service{repo: repo, newID: newID}
}

// ── 신고 ─────────────────────────────────────────────────────────────────────

func (s *Service) Report(ctx context.Context, reporterID string, t TargetType, targetID, reason, details string) error {
	if reporterID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if !validTarget(t) {
		return errs.New(errs.Validation, "알 수 없는 신고 대상입니다")
	}
	if targetID == "" {
		return errs.New(errs.Validation, "신고 대상을 지정해 주세요")
	}
	if !validReasons[reason] {
		return errs.New(errs.Validation, "알 수 없는 신고 사유입니다")
	}

	authorID, ok, err := s.canSee(ctx, reporterID, t, targetID)
	if err != nil {
		return err
	}
	// 못 보는 것은 **없는 것**이다 — 신고 창구로 존재 여부를 캐낼 수 없게.
	if !ok {
		return errs.New(errs.NotFound, "대상을 찾을 수 없습니다")
	}
	if authorID == reporterID {
		return errs.New(errs.Validation, "자기 콘텐츠는 신고할 수 없습니다")
	}
	return s.repo.CreateReport(ctx, s.newID(), t, targetID, reporterID, reason, strings.TrimSpace(details))
}

// canSee는 "이 사람이 지금 이것을 볼 수 있는가"다. 신고 가능 여부가 곧 이 값이다.
func (s *Service) canSee(ctx context.Context, viewerID string, t TargetType, targetID string) (string, bool, error) {
	switch t {
	case TargetPost:
		return s.canSeePost(ctx, viewerID, targetID)

	case TargetComment:
		target, ok, err := s.repo.GetTarget(ctx, TargetComment, targetID)
		if err != nil || !ok || target.ModerationStatus != "approved" {
			return "", false, err
		}
		// 댓글은 **부모 글**을 볼 수 있어야 보인다.
		if _, parentOK, err := s.canSeePost(ctx, viewerID, target.PostID); err != nil || !parentOK {
			return "", false, err
		}
		return target.AuthorID, true, nil

	case TargetStory:
		target, ok, err := s.repo.GetTarget(ctx, TargetStory, targetID)
		if err != nil || !ok || target.ModerationStatus != "approved" {
			return "", false, err
		}
		// 이미 사라진 스토리는 신고할 것이 없다.
		if !target.ExpiresAt.After(time.Now()) {
			return "", false, nil
		}
		if target.AuthorID == viewerID {
			return target.AuthorID, true, nil
		}
		following, err := s.repo.IsFollowing(ctx, viewerID, target.AuthorID)
		if err != nil || !following {
			return "", false, err
		}
		return target.AuthorID, true, nil
	}
	return "", false, nil
}

func (s *Service) canSeePost(ctx context.Context, viewerID, postID string) (string, bool, error) {
	authorID, visibility, status, ok, err := s.repo.PostVisibility(ctx, postID)
	if err != nil || !ok || status != "approved" {
		return "", false, err
	}
	if authorID == viewerID || visibility == "public" {
		return authorID, true, nil
	}
	if visibility == "followers" {
		following, err := s.repo.IsFollowing(ctx, viewerID, authorID)
		if err != nil || !following {
			return "", false, err
		}
		return authorID, true, nil
	}
	return "", false, nil
}

// ── 검토 ─────────────────────────────────────────────────────────────────────

// ListQueue는 신고 묶음과 자동 보류를 한 목록으로 준다. **최신 순**이다.
func (s *Service) ListQueue(ctx context.Context, viewerID, role string, limit int32) ([]QueueItem, error) {
	if err := requireModerator(viewerID, role); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = defaultQueue
	}
	if limit > maxQueue {
		limit = maxQueue
	}

	reports, err := s.repo.ListPendingReports(ctx, reportScanLimit)
	if err != nil {
		return nil, err
	}

	// 같은 대상은 한 줄로 묶는다 — 검토자가 같은 글을 여러 번 보지 않게.
	type group struct {
		reasons map[string]bool
		count   int32
		latest  time.Time
	}
	groups := map[string]*group{}
	order := []Report{}
	for _, r := range reports {
		key := string(r.TargetType) + ":" + r.TargetID
		g, ok := groups[key]
		if !ok {
			g = &group{reasons: map[string]bool{}}
			groups[key] = g
			order = append(order, r)
		}
		g.reasons[r.Reason] = true
		g.count++
		if r.CreatedAt.After(g.latest) {
			g.latest = r.CreatedAt
		}
	}

	items := make([]QueueItem, 0, len(order))
	seen := map[string]bool{}
	for _, r := range order {
		key := string(r.TargetType) + ":" + r.TargetID
		target, ok, err := s.repo.GetTarget(ctx, r.TargetType, r.TargetID)
		if err != nil {
			return nil, err
		}
		// 이미 내려갔거나 사라진 대상은 큐에 두지 않는다.
		if !ok || target.ModerationStatus == "removed" {
			continue
		}
		seen[key] = true
		g := groups[key]
		items = append(items, QueueItem{
			TargetType:  r.TargetType,
			TargetID:    r.TargetID,
			Source:      "report",
			Reasons:     sortedKeys(g.reasons),
			ReportCount: g.count,
			Author:      target.Author,
			Preview:     target.Preview,
			CreatedAt:   g.latest,
		})
	}

	// 신고가 없어도 자동 스캔이 보류한 것은 검토 대상이다.
	auto, err := s.repo.ListAutoPending(ctx, maxQueue)
	if err != nil {
		return nil, err
	}
	for _, item := range auto {
		if seen[string(item.TargetType)+":"+item.TargetID] {
			continue
		}
		items = append(items, item)
	}

	sortByNewest(items)
	if int32(len(items)) > limit {
		items = items[:limit]
	}
	return items, nil
}

// Resolve는 감추거나(remove) 되살린다(approve). 어느 쪽이든 그 대상의 신고는 함께 종결된다.
func (s *Service) Resolve(ctx context.Context, reviewerID, role string, t TargetType, targetID string, remove bool, reason string) error {
	if err := requireModerator(reviewerID, role); err != nil {
		return err
	}
	if !validTarget(t) {
		return errs.New(errs.Validation, "알 수 없는 신고 대상입니다")
	}
	target, ok, err := s.repo.GetTarget(ctx, t, targetID)
	if err != nil {
		return err
	}
	if !ok {
		return errs.New(errs.NotFound, "대상을 찾을 수 없습니다")
	}

	status := "approved"
	reportStatus, action := "dismissed", "dismissed"
	if remove {
		status = "removed"
		reportStatus, action = "resolved", "removed"
	}
	// 사진이 딸려 있으면 바이트도 함께 막는다(승인이면 푼다).
	if err := s.repo.SetModeration(ctx, t, targetID, status, strings.TrimSpace(reason), remove, MediaKey(target.Preview.MediaURL)); err != nil {
		return err
	}
	return s.repo.ResolveReports(ctx, t, targetID, reviewerID, reportStatus, action)
}

// ── 내부 ─────────────────────────────────────────────────────────────────────

// 로그인하지 않은 것과 권한이 없는 것은 **다른 답**이어야 한다.
//
// 둘 다 403으로 답하면 화면이 토큰을 갱신해 다시 시도할 기회를 잃는다 — 새로고침 직후에는
// access 토큰이 아직 메모리에 없어서 신원 없이 첫 요청이 나가는데, 그것이 403이면
// **정당한 모더레이터에게도 "권한 없음"이 뜬다**(실측으로 잡은 결함).
func requireModerator(viewerID, role string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if !canModerate[role] {
		// 권한이 없다는 사실 자체는 숨기지 않는다 — 검토 화면은 존재가 비밀이 아니다.
		return errs.New(errs.Forbidden, "권한이 없습니다")
	}
	return nil
}

func validTarget(t TargetType) bool {
	return t == TargetPost || t == TargetStory || t == TargetComment
}

// `/media/file/<key>` → key. 우리 경로가 아니면 빈 문자열(막을 것이 없다).
var mediaPathRe = regexp.MustCompile(`^/media/file/([A-Za-z0-9._-]+)$`)

func MediaKey(url string) string {
	m := mediaPathRe.FindStringSubmatch(url)
	if m == nil {
		return ""
	}
	return m[1]
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	// 사유 순서가 조회마다 흔들리면 화면이 깜빡인다 — 이름순으로 고정한다.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func sortByNewest(items []QueueItem) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j].CreatedAt.After(items[j-1].CreatedAt); j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}
