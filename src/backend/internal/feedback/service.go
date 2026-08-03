// @plm SRS-006  개발 피드백 규칙 — 아이디어보드로 보내고, 우리 것만 골라 되읽는다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것 둘:
//
//	① **누가 쓸 수 있나** — coworker·admin뿐이다. 화면이 탭을 숨기는 것과 별개로 여기서 막는다.
//	② **어느 아이디어가 우리 것인가** — 본문 최후미의 기계 마커로 알아본다.
//
// ── 왜 마커를 심나 ──────────────────────────────────────────────────────────
// PLM 아이디어보드에는 "분류"도 "제출자 id"도 칸이 없다. 우리 DB에 따로 쌓으면 두 곳이
// 어긋나므로, **본문 안에** 기계 판독용 한 줄을 심어 왕복시킨다. HTML 주석이라 대시보드에서는
// 눈에 띄지 않는다.
//
// ── 마커는 신뢰 경계다 ─────────────────────────────────────────────────────
// 사용자가 상세 본문에 마커처럼 생긴 문자열을 적어 넣을 수 있다. 그래서:
//
//	· **마지막** 마커만 믿는다(우리가 심은 것은 항상 최후미다)
//	· 마커 **앞에 푸터가 있어야** 한다 — 대시보드에서 손으로 쓴 마커-only 본문을 배제한다
//
// 둘 중 하나라도 어긋나면 그 항목은 우리 것이 아니다(= 목록에서 빠진다). 이 검사가 없으면
// 남의 uid를 적어 넣어 "내 피드백"으로 위장하거나, 분류를 조작할 수 있다.
//
// ── 상태는 읽기만 한다 ─────────────────────────────────────────────────────
// 논의·투표·채택은 PLM에서 돌아간다. 모르는 상태 문자열이 와도 **원문을 함께** 실어
// 화면이 빈칸을 보이지 않게 한다.
// ─────────────────────────────────────────────────────────────────────────────
package feedback

import (
	"context"
	"regexp"
	"sort"
	"strings"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 이 탭을 쓸 수 있는 역할. 사용자 기능이 아니다.
var canUseFeedback = map[string]bool{"coworker": true, "admin": true}

// 분류 → 제목 접두. 목록에서 눈으로 훑을 때 쓰는 표시일 뿐, 판독은 마커가 한다.
var categoryPrefix = map[string]string{"bug": "버그", "improvement": "개선"}

const (
	// 제출자 줄과 본문을 가르는 구분자. **마커보다 앞에 있어야** 정상 구조다.
	footerSep = "\n\n---\n"
	// 상세·제목 길이는 계약(protovalidate)이 먼저 막지만, 서비스도 자기 몫을 검사한다 —
	// 계약은 trim 이전 길이를 보므로 공백만 적은 입력이 통과할 수 있다.
	minTitle  = 3
	minDetail = 5
)

// 우리가 심는 기계 판독 마커. 렌더될 때 눈에 띄지 않는 HTML 주석이다.
var markerRe = regexp.MustCompile(`<!--\s*liftgram-feedback v=1 cat=([a-z]+) uid=(\S+)\s*-->`)

// Idea는 아이디어보드가 돌려주는 한 행이다. 이 도메인이 **바깥의 모양을 아는 유일한 곳**이라,
// 보드가 바뀌면 여기와 어댑터만 고치면 된다.
type Idea struct {
	ID           int64
	Title        string
	Body         string
	State        string
	PromotedCode string
}

// Board는 아이디어보드에 말하는 방법이다. 규칙이 HTTP를 모르게 하려고 port로 둔다 —
// 테스트는 가짜 보드로 돌고, 진짜 구현은 board_http.go에 있다.
type Board interface {
	Create(ctx context.Context, title, body string) (int64, error)
	List(ctx context.Context) ([]Idea, error)
}

// Repo는 제출자 이름을 붙이는 데에만 쓴다. 피드백 자체는 우리 DB에 남지 않는다.
type Repo interface {
	DisplayLabel(ctx context.Context, userID string) (string, error)
}

// Item은 화면이 받는 한 줄이다.
type Item struct {
	ID           int64
	Category     string
	Title        string
	Detail       string
	State        string
	Mine         bool
	PromotedCode string
}

type Service struct {
	board Board
	repo  Repo
}

func NewService(board Board, repo Repo) *Service { return &Service{board: board, repo: repo} }

// 역할 검사. 신원이 없으면 401(로그인해라), 있는데 역할이 아니면 403(너는 못 한다) —
// 화면이 "로그인" 화면을 띄울지 "권한 없음"을 띄울지가 이 구분에 달렸다.
func requireInsider(viewerID, role string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "login required")
	}
	if !canUseFeedback[role] {
		return errs.New(errs.Forbidden, "insider only")
	}
	return nil
}

// Submit은 아이디어보드에 한 건 등록한다. 우리 쪽에 남는 것은 없다 —
// 성공은 "보드가 id를 줬다"는 뜻이고, 그 id로 되읽을 수 있다.
func (s *Service) Submit(ctx context.Context, viewerID, role, category, title, detail string) (int64, error) {
	if err := requireInsider(viewerID, role); err != nil {
		return 0, err
	}
	title, detail = strings.TrimSpace(title), strings.TrimSpace(detail)
	// 계약은 trim 이전 길이를 봤다 — 공백만 적힌 입력은 여기서 걸린다.
	if len([]rune(title)) < minTitle || len([]rune(detail)) < minDetail {
		return 0, errs.New(errs.Validation, "title/detail too short")
	}
	prefix, ok := categoryPrefix[category]
	if !ok {
		return 0, errs.New(errs.Validation, "unknown category")
	}

	// 제출자 이름을 못 읽어도 등록은 진행한다 — 이름은 편의고, 피드백을 잃는 쪽이 더 큰 손해다.
	who, err := s.repo.DisplayLabel(ctx, viewerID)
	if err != nil || strings.TrimSpace(who) == "" {
		who = viewerID
	}
	// 줄바꿈을 지운다. 제출자 줄에 개행이 섞이면 되읽을 때 본문 자르는 위치가 어긋난다.
	who = strings.TrimSpace(strings.NewReplacer("\r", " ", "\n", " ").Replace(who))

	id, err := s.board.Create(ctx, "["+prefix+"] "+title, buildBody(detail, who, category, viewerID))
	if err != nil {
		return 0, err
	}
	return id, nil
}

// buildBody는 되읽기까지 염두에 둔 본문을 만든다: 상세 → 푸터 → 마커(최후미).
// 이 순서가 곧 parseItem의 검사 조건이다.
func buildBody(detail, who, category, uid string) string {
	return detail + footerSep +
		"_제출: " + who + " · Liftgram 인앱 피드백_\n" +
		"<!-- liftgram-feedback v=1 cat=" + category + " uid=" + uid + " -->"
}

// List는 이 프로젝트의 **인앱 피드백만** 돌려준다(대시보드 수기 아이디어는 섞이지 않는다).
// 정렬은 최신순 — id가 곧 시간 순서다.
func (s *Service) List(ctx context.Context, viewerID, role string) ([]Item, error) {
	if err := requireInsider(viewerID, role); err != nil {
		return nil, err
	}
	rows, err := s.board.List(ctx)
	if err != nil {
		return nil, err
	}
	items := make([]Item, 0, len(rows))
	for _, row := range rows {
		if it, ok := parseItem(row, viewerID); ok {
			items = append(items, it)
		}
	}
	// 최신이 위로. 보드가 어떤 순서로 주든 화면의 순서는 우리가 정한다.
	sort.SliceStable(items, func(i, j int) bool { return items[i].ID > items[j].ID })
	return items, nil
}

// parseItem은 보드의 한 행이 **우리가 심은 것인지** 판정하고, 사람이 읽을 모양으로 되돌린다.
// 우리 것이 아니면 (Item{}, false).
func parseItem(row Idea, viewerID string) (Item, bool) {
	// 마지막 마커만 믿는다 — 우리가 심은 것은 항상 최후미다.
	all := markerRe.FindAllStringSubmatchIndex(row.Body, -1)
	if len(all) == 0 {
		return Item{}, false
	}
	last := all[len(all)-1]
	markerStart := last[0]
	category := row.Body[last[2]:last[3]]
	uid := row.Body[last[4]:last[5]]

	// 푸터가 마커보다 앞에 있어야 한다. 이 검사가 없으면 대시보드에서 마커만 적어
	// 남의 uid로 위장하거나 분류를 조작할 수 있다.
	sep := strings.LastIndex(row.Body, footerSep)
	if sep < 0 || sep > markerStart {
		return Item{}, false
	}

	return Item{
		ID:       row.ID,
		Category: category,
		// 우리가 붙인 접두를 뗀다. 사용자가 제목에 적은 대괄호는 접두 자리에만 걸린다.
		Title: stripPrefix(row.Title),
		// 보이는 본문 = 마지막 푸터 앞까지. 사용자가 적은 `---`는 그대로 남는다.
		Detail:       strings.TrimSpace(row.Body[:sep]),
		State:        row.State,
		Mine:         uid == viewerID,
		PromotedCode: row.PromotedCode,
	}, true
}

var prefixRe = regexp.MustCompile(`^\[[^\]]*\]\s*`)

func stripPrefix(title string) string { return strings.TrimSpace(prefixRe.ReplaceAllString(title, "")) }
