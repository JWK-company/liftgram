// 코치 코멘트·담당 회원 점검 (SPEC-050 P4 · ADR-062 · SRS-115)
//
// ─────────────────────────────────────────────────────────────────────────────
// 코멘트 = 코치가 회원 운동 하나에 남기는 말이다. 이 파일이 지키는 것:
//
//	① 쓰기 — 지금 활성 ∧ logView ∧ 차단 아님 · 그 회원의 **완료** 운동 · visibleFrom 뒤 · 300자(룬) · 코치당 회원당 하루 20개
//	② 읽기 — 코치는 지금 활성 ∧ logView 일 때 **자기** 코멘트만 · 회원은 언제나(해지 뒤에도 — 받은 말은 회원 것)
//	   차단한(된) 코치의 코멘트는 회원에게도 보이지 않는다(쿼리가 뺀다)
//	③ 숨기기 — 코치(자기 것)·회원(자기 운동의 것). 숨긴 코멘트는 누구에게도 나가지 않는다
//	④ 알림·감사는 커밋 뒤 — 알림은 coaching_comment(ref_id = 운동 id · post_id 는 비운다), 차단 사이면 보내지 않는다
//
// 점검(ListMemberDigest) = 담당 회원마다 이번 주 운동 수·마지막 운동·코치 루틴 운동 수. **사실 숫자만** — 판단(「쉬는 중」)은
// 화면이 기기 날짜로 세고, 「이렇게 하세요」는 코치가 말한다(ADR-028). 모두 visibleFrom 뒤만 센다.
//
// 이 파일은 pgx·connect·proto 를 모른다(service 경계).
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 감사 action(P4).
const (
	ActionCommentAdd  = "comment_add"
	ActionCommentHide = "comment_hide"
)

// 상한(SPEC-050 · REV-097).
const (
	maxCommentRunes     = 300
	maxCommentsPerDay   = 20
	commentDayWindow    = 24 * time.Hour
	maxDigestMembers    = 200
	digestWeekFallback  = 7 * 24 * time.Hour
	digestWeekStartSlop = 8 * 24 * time.Hour
)

// 화면이 그대로 보이는 문구.
const (
	msgCommentEmpty     = "코멘트를 적어 주세요"
	msgCommentTooLong   = "코멘트는 %d자까지 쓸 수 있어요"
	msgCommentDaily     = "한 회원에게 코멘트는 하루 %d개까지 남길 수 있어요"
	msgCommentNoWorkout = "이 운동을 찾을 수 없어요"
	msgCommentNotFound  = "코멘트를 찾을 수 없어요"
	msgLogOff           = "회원이 기록 보기를 꺼 두었어요"
	msgPickWorkout      = "운동을 골라 주세요"
)

// Comment는 코멘트 한 줄이다(coaching_comments + 코치 표시 이름).
type Comment struct {
	ID          string
	GrantID     string
	TrainerID   string
	MemberID    string
	WorkoutID   string
	Body        string
	TrainerName string
	CreatedAt   time.Time
	HiddenAt    time.Time
	// 보는 사람이 숨길 수 있나 — 서비스가 채운다.
	CanHide bool
}

// DigestRow — 저장소가 돌려주는 점검 한 줄(ListMemberDigestRows · 관계 + 숫자 한 질의).
type DigestRow struct {
	MemberID string
	Scope    map[string]bool
	DigestCounts
}

// MemberDigest는 담당 회원 한 명의 이번 주 숫자다.
type MemberDigest struct {
	MemberID          string
	LogView           bool
	WeekWorkouts      int
	LastWorkoutAt     time.Time // 제로 = 없음
	WeekCoachWorkouts int
}

// DigestCounts — 저장소가 돌려주는 숫자(MemberWorkoutDigest).
type DigestCounts struct {
	WeekWorkouts      int
	LastStartedAtMs   int64
	WeekCoachWorkouts int
}

// CommentRepo는 코멘트·점검 저장소(P4)다.
type CommentRepo interface {
	// [원본] InsertComment(ctx, c) — 세기와 넣기가 따로라 동시 요청이 하루 상한을 넘었다(리뷰)
	// [개선] InsertCommentCapped — 한 트랜잭션: 관계 FOR UPDATE → 활성·logView·차단 다시 확인 → since 뒤 개수 → 넣기.
	//        상한이면 ResourceExhausted · 관계가 그 사이 끝났으면 Forbidden(도메인 오류 그대로).
	InsertCommentCapped(ctx context.Context, c Comment, since time.Time, maxPerDay int) (Comment, error)
	CountCommentsSince(ctx context.Context, trainerID, memberID string, since time.Time) (int, error)
	// ListCommentsForWorkout — 그 회원 운동의 코멘트(숨긴 것·차단 사이 빼고). trainerID 가 비면 모든 코치.
	ListCommentsForWorkout(ctx context.Context, memberID, workoutID, trainerID string) ([]Comment, error)
	// ListCommentsByPair — 이 코치가 이 회원에게 남긴 코멘트(숨긴 것 빼고 · 최근 것부터).
	ListCommentsByPair(ctx context.Context, trainerID, memberID string) ([]Comment, error)
	GetComment(ctx context.Context, id string) (Comment, error)
	// HideComment — 숨겼으면 true(이미 숨김이면 false).
	HideComment(ctx context.Context, id string) (bool, error)
	// [원본] MemberWorkoutDigest(ctx, trainerID, memberID, visibleFromMs, weekStartMs, toMs) — 회원마다 한 번(N+1)
	// [개선] ListMemberDigestRows — 이 코치의 활성 관계(차단 사이 빼고) + 숫자를 한 질의로 limit 줄까지.
	//        컷은 visibleFrom 과 같은 기준(pastRecords → 0 · 동의 없음 → nowMs · 그 밖 → 동의 시각) · logView 꺼짐은 0.
	ListMemberDigestRows(ctx context.Context, trainerID string, weekStartMs, toMs, nowMs int64, limit int) ([]DigestRow, error)
	// ListCoachMemberRoutineIDs — 이 코치가 이 회원에게 보낸 루틴의 회원 쪽 id(처방 대 실제 칸 판정 · 점검과 같은 기준).
	ListCoachMemberRoutineIDs(ctx context.Context, trainerID, memberID string) (map[string]bool, error)
}

// cleanCommentBody — 줄바꿈·탭만 남기고 제어 문자(unicode.IsControl)와 서식 문자(Cf — 폭 없는 공백 U+200B~200F ·
// 방향 바꿈 U+202A~202E·U+2066~2069 · BOM U+FEFF 등)를 지운 뒤 앞뒤 공백을 걷는다(리뷰 — 글자 뒤집기·숨은 글자 막기).
// 예외 하나: 그림 문자 사이의 ZWJ(U+200D)는 남긴다(👨‍👩‍👧 같은 합친 이모지가 쪼개지지 않게). 길이·빈 글 판정은 지운 뒤에 한다.
func cleanCommentBody(s string) string {
	rs := []rune(s)
	var b strings.Builder
	b.Grow(len(s))
	for i, r := range rs {
		switch {
		case r == '\n' || r == '\t':
		case r == '\u200d' && i > 0 && i+1 < len(rs) && unicode.Is(unicode.So, rs[i-1]) && unicode.Is(unicode.So, rs[i+1]):
		case unicode.IsControl(r) || unicode.Is(unicode.Cf, r):
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// commentAccess — 코치(viewer)가 이 회원의 기록에 코멘트를 쓰거나 읽을 수 있는지(활성 ∧ logView ∧ 차단 아님).
// 문구는 한국어 — 회원 화면은 PermissionDenied 를 받으면 연결을 다시 읽어 끝남/범위 꺼짐을 가른다.
func (s *Service) commentAccess(ctx context.Context, trainerID, memberID string) (Grant, error) {
	g, err := s.repo.GetGrantByPair(ctx, trainerID, memberID)
	if err != nil {
		if isNotFound(err) {
			return Grant{}, errs.New(errs.Forbidden, msgNotActive)
		}
		return Grant{}, err
	}
	if g.Status != StatusActive {
		return Grant{}, errs.New(errs.Forbidden, msgNotActive)
	}
	if !g.Scope[ScopeLogView] {
		return Grant{}, errs.New(errs.Forbidden, msgLogOff)
	}
	if err := s.assertNotBlocked(ctx, trainerID, memberID); err != nil {
		return Grant{}, err
	}
	return g, nil
}

// workoutVisible — 그 회원의 완료 운동이고 visibleFrom 뒤에 시작했나(payload 의 state·started_at 만 읽는다).
func workoutVisible(payload []byte, vf time.Time) bool {
	var obj map[string]json.RawMessage
	if json.Unmarshal(payload, &obj) != nil {
		return false
	}
	if rawStr(obj, "state") != "completed" {
		return false
	}
	at, ok := rawNum(obj, "started_at")
	if !ok {
		return false
	}
	return vf.IsZero() || at >= float64(vf.UnixMilli())
}

// assertWorkoutVisible — 없거나·끝내지 않았거나·컷 앞이면 모두 같은 NotFound(있는지조차 알리지 않는다).
func (s *Service) assertWorkoutVisible(ctx context.Context, g Grant, workoutID string) error {
	_, payload, err := s.repo.GetMemberRecord(ctx, g.MemberID, "workouts", workoutID)
	if err != nil {
		if isNotFound(err) {
			return errs.New(errs.NotFound, msgCommentNoWorkout)
		}
		return err
	}
	if !workoutVisible(payload, visibleFrom(g)) {
		return errs.New(errs.NotFound, msgCommentNoWorkout)
	}
	return nil
}

// AddComment는 코치(viewer)가 회원 운동 하나에 코멘트를 남긴다.
func (s *Service) AddComment(ctx context.Context, viewerID, memberID, workoutID, body string) (Comment, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Comment{}, err
	}
	if memberID == viewerID {
		return Comment{}, errs.New(errs.Validation, "cannot coach yourself")
	}
	// [원본] body = strings.TrimSpace(body)
	// [개선] 제어·서식 문자를 지운 뒤 판정한다(폭 없는 문자만 → 빈 글 · 리뷰)
	body = cleanCommentBody(body)
	switch n := utf8.RuneCountInString(body); {
	case n == 0:
		return Comment{}, errs.New(errs.Validation, msgCommentEmpty)
	case n > maxCommentRunes:
		return Comment{}, errs.New(errs.Validation, msgCommentTooLong, maxCommentRunes)
	}
	workoutID = strings.TrimSpace(workoutID)
	if workoutID == "" {
		return Comment{}, errs.New(errs.Validation, msgPickWorkout)
	}
	g, err := s.commentAccess(ctx, viewerID, memberID)
	if err != nil {
		return Comment{}, err
	}
	if err := s.assertWorkoutVisible(ctx, g, workoutID); err != nil {
		return Comment{}, err
	}
	// [원본] CountCommentsSince → n >= 20 이면 거절 → InsertComment (따로 — 동시 요청이 상한을 넘었다)
	// [개선] 한 트랜잭션(관계 FOR UPDATE → 활성·logView·차단 다시 확인 → 세기 → 넣기 · 리뷰)
	c, err := s.repo.InsertCommentCapped(ctx, Comment{
		ID: s.newID(), GrantID: g.ID, TrainerID: viewerID, MemberID: memberID, WorkoutID: workoutID, Body: body,
	}, s.now().Add(-commentDayWindow), maxCommentsPerDay)
	if err != nil {
		return Comment{}, err
	}
	if p, err := s.repo.GetPeer(ctx, viewerID); err == nil {
		c.TrainerName = p.DisplayName
	}
	// [원본] c.CanHide = true — 숨기기는 없어졌다(SPEC-059)

	// ── 커밋 뒤: 알림(차단이면 notifyAfter 가 거른다) → 감사 ──
	s.notifyAfter(ctx, memberID, viewerID, notifyKindCoachingComment, workoutID)
	detail, _ := json.Marshal(map[string]any{"commentId": c.ID, "workoutId": workoutID})
	s.audit(ctx, g.ID, viewerID, ActionCommentAdd, detail)
	return c, nil
}

// ListComments — 코치(member_id 지정)는 자기 코멘트만 · 회원(member_id 비움 또는 나)은 자기 운동의 코멘트 전부.
func (s *Service) ListComments(ctx context.Context, viewerID, memberID, workoutID string) ([]Comment, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	workoutID = strings.TrimSpace(workoutID)
	if memberID == "" || memberID == viewerID {
		// 회원 — 받은 말은 언제나 볼 수 있다(해지 뒤에도). 차단한(된) 코치 것은 쿼리가 뺀다.
		if workoutID == "" {
			return nil, errs.New(errs.Validation, msgPickWorkout)
		}
		rows, err := s.repo.ListCommentsForWorkout(ctx, viewerID, workoutID, "")
		if err != nil {
			return nil, err
		}
		// [원본] for i := range rows { rows[i].CanHide = true } — 숨기기는 없어졌다(SPEC-059)
		return nonNilComments(rows), nil
	}

	// 코치 — 지금 활성 ∧ logView ∧ 차단 아님.
	g, err := s.commentAccess(ctx, viewerID, memberID)
	if err != nil {
		return nil, err
	}
	if workoutID != "" {
		if err := s.assertWorkoutVisible(ctx, g, workoutID); err != nil {
			return nil, err
		}
		rows, err := s.repo.ListCommentsForWorkout(ctx, memberID, workoutID, viewerID)
		if err != nil {
			return nil, err
		}
		// [원본] for i := range rows { rows[i].CanHide = true } — 숨기기는 없어졌다(SPEC-059)
		return nonNilComments(rows), nil
	}
	rows, err := s.repo.ListCommentsByPair(ctx, viewerID, memberID)
	if err != nil {
		return nil, err
	}
	// 지금 보이는 운동의 코멘트만 — 회원이 지난 기록을 다시 껐거나 운동을 지웠으면 그 운동의 코멘트도 내지 않는다.
	ids := make([]string, 0, len(rows))
	seen := map[string]bool{}
	for _, c := range rows {
		if !seen[c.WorkoutID] {
			seen[c.WorkoutID] = true
			ids = append(ids, c.WorkoutID)
		}
	}
	visible := map[string]bool{}
	if len(ids) > 0 {
		recs, err := s.repo.ListMemberRecordsByIDs(ctx, memberID, "workouts", ids, newReadBudget(maxMemberRecordsReadBytes))
		if err != nil {
			return nil, err
		}
		vf := visibleFrom(g)
		for _, r := range recs {
			if workoutVisible(r.Payload, vf) {
				visible[r.RecordID] = true
			}
		}
	}
	out := make([]Comment, 0, len(rows))
	for _, c := range rows {
		if visible[c.WorkoutID] {
			// [원본] c.CanHide = true — 숨기기는 없어졌다(SPEC-059)
			out = append(out, c)
		}
	}
	return out, nil
}

// HideComment — 코치(자기 것)·회원(자기 운동의 것). 남의 코멘트는 없는 것과 같다(NotFound). 이미 숨겼으면 그대로 성공.
func (s *Service) HideComment(ctx context.Context, viewerID, commentID string) error {
	if err := requireIdentity(viewerID); err != nil {
		return err
	}
	c, err := s.repo.GetComment(ctx, commentID)
	if err != nil {
		if isNotFound(err) {
			return errs.New(errs.NotFound, msgCommentNotFound)
		}
		return err
	}
	by := ""
	switch viewerID {
	case c.TrainerID:
		by = SideTrainer
	case c.MemberID:
		by = SideMember
	default:
		return errs.New(errs.NotFound, msgCommentNotFound)
	}
	hidden, err := s.repo.HideComment(ctx, commentID)
	if err != nil {
		return err
	}
	// [원본] if hidden { … } — 코치가 탈퇴해 관계가 사라졌으면(grant_id 빈 글자 · 0035) 감사를 남길 관계가 없다
	if hidden && c.GrantID != "" {
		detail, _ := json.Marshal(map[string]any{"commentId": c.ID, "workoutId": c.WorkoutID, "by": by})
		s.audit(ctx, c.GrantID, viewerID, ActionCommentHide, detail)
	}
	return nil
}

// ListMemberDigest — 코치(viewer)의 활성 담당 회원마다 이번 주 숫자. weekStartMs 는 보는 기기의 「이번 주」 시작.
// 200명을 넘으면 앞 200명만 돌려주고 truncated = true(화면은 나머지를 원래 순서 뒤에 둔다).
func (s *Service) ListMemberDigest(ctx context.Context, viewerID string, weekStartMs int64) ([]MemberDigest, bool, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, false, err
	}
	now := s.now()
	if weekStartMs <= 0 || weekStartMs > now.UnixMilli() || weekStartMs < now.Add(-digestWeekStartSlop).UnixMilli() {
		weekStartMs = now.Add(-digestWeekFallback).UnixMilli()
	}
	toMs := now.Add(24 * time.Hour).UnixMilli() // 기기 시계가 조금 빨라도 방금 끝낸 운동까지
	// [원본] ListGrants → 회원마다 Blocked·MemberWorkoutDigest(N+1)
	// [개선] 한 질의(관계 + 차단 빼기 + LATERAL 숫자) · 하나 더 읽어 잘림을 안다(리뷰)
	rows, err := s.repo.ListMemberDigestRows(ctx, viewerID, weekStartMs, toMs, now.UnixMilli(), maxDigestMembers+1)
	if err != nil {
		return nil, false, err
	}
	truncated := len(rows) > maxDigestMembers
	if truncated {
		rows = rows[:maxDigestMembers]
	}
	out := make([]MemberDigest, 0, len(rows))
	for _, r := range rows {
		d := MemberDigest{MemberID: r.MemberID, LogView: r.Scope[ScopeLogView]}
		if d.LogView {
			d.WeekWorkouts, d.WeekCoachWorkouts = r.WeekWorkouts, r.WeekCoachWorkouts
			if r.LastStartedAtMs > 0 {
				d.LastWorkoutAt = time.UnixMilli(r.LastStartedAtMs)
			}
		}
		out = append(out, d)
	}
	return out, truncated, nil
}

func nonNilComments(c []Comment) []Comment {
	if c == nil {
		return []Comment{}
	}
	return c
}
