// 코칭 v2 — 범위·코치 한 명·초대 코드·알림·대화방 (SPEC-050 · ADR-062 · SRS-115)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 더하는 규칙:
//
//	① 범위 키는 넷뿐(logView·routineEdit·bodyView·pastRecords) — 저장할 때 이 넷만 쓴다(Scope 의 json 태그)
//	② 회원이 고른다 — 회원이 요청하거나 수락할 때 범위를 받고, 코치가 보낸 범위는 무시한다
//	③ 다시 연결하면 범위는 요청값(없으면 기본값)으로 — 옛 범위가 되살아나지 않는다
//	④ 코치는 한 명 — 정본은 DB 부분 유일 인덱스(coaching_grants_one_coach). 앞선 확인은 화면에 먼저 알리려는 것
//	⑤ 지난 기록은 pastRecords 를 켰을 때만 — visibleFrom(g) 하나로 모든 회원 기록 RPC 를 자른다
//	⑥ 알림·대화방은 **커밋 뒤에**, 실패해도 본 동작은 성공이다. 차단 사이면 보내지 않는다
//
// 이 파일은 pgx·connect·proto 를 모른다(service 경계). 트랜잭션은 저장소 메서드가 맡는다.
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 새 범위 키(SPEC-050). 옛 ScopeScheduleEdit 는 쓰는 곳이 없어 저장하지 않는다.
const (
	ScopeBodyView    = "bodyView"
	ScopePastRecords = "pastRecords"
)

// 감사 action(SPEC-050). routine_send·routine_update·comment_add·comment_hide 는 P3b·P4.
const (
	ActionScopeChange  = "scope_change"
	ActionInviteCreate = "invite_create"
	ActionInviteAccept = "invite_accept"
)

// 화면이 그대로 보이는 문구(SPEC-050) — errorText 는 한글이 든 서버 문구를 그대로 띄운다.
const (
	msgOneCoach       = "이미 코치가 있어요. 지금 연결을 끊은 뒤 다시 해 주세요"
	msgInviteNotFound = "초대 코드를 찾을 수 없어요. 코치에게 새 코드를 받아 주세요"
	msgOwnInvite      = "내 초대 코드예요"
	msgTryLater       = "잠시 뒤 다시 해 주세요"
	msgNotParty       = "이 코칭 연결의 당사자가 아니에요"
	msgRequestExists  = "이미 보낸 요청이 있어요"
	// 코치가 수락할 때 회원에게 이미 다른 코치가 있다 — 코치는 그 연결을 끊을 수 없다(P1a 리뷰)
	msgMemberHasCoach = "이 회원은 이미 다른 코치와 연결돼 있어요"
	// P3b SendRoutine 이 쓴다 — 「○○」 자리에 종목 이름.
	msgCustomExercise = "「%s」은 직접 만든 종목이라 보낼 수 없어요"

	msgStateChanged     = "이미 처리됐거나 상태가 바뀌었어요. 새로 고친 뒤 다시 해 주세요"
	msgAlreadyConnected = "이미 이 코치와 연결돼 있어요"
	msgScopeMemberOnly  = "범위는 회원만 바꿀 수 있어요"
	msgNotActive        = "연결 중인 코칭이 아니에요"
	msgBlocked          = "이 사용자와는 코칭을 할 수 없어요"
	msgNoteTooLong      = "메시지는 %d자까지 쓸 수 있어요"
)

// 입력 상한.
const (
	maxRequestNoteRunes = 100
	// 초대 코드 — Crockford base32 8자 · 14일.
	inviteCodeLen     = 8
	inviteTTL         = 14 * 24 * time.Hour
	inviteCodeTries   = 5
	crockfordAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
)

// 알림 종류 이름 — notification.Kind* 와 같은 문자열이어야 한다(테스트가 본다).
const (
	notifyKindCoachingRequest       = "coaching_request"
	notifyKindCoachingAccept        = "coaching_accept"
	notifyKindCoachingRevoke        = "coaching_revoke"
	notifyKindCoachingRoutine       = "coaching_routine"        // P3b
	notifyKindCoachingRoutineUpdate = "coaching_routine_update" // P3b(10분 묶음 — 이번 단계는 쓰지 않는다)
	notifyKindCoachingComment       = "coaching_comment"        // P4
)

// ErrInviteCodeTaken — 저장소가 「같은 코드가 이미 살아 있다」를 알리는 값. 서비스가 새 코드로 다시 뽑는다.
var ErrInviteCodeTaken = errors.New("invite code taken")

// Scope는 회원이 여는 범위다. **json 태그가 저장 키다**(태그 없는 Go JSON 은 PascalCase 가 된다) —
// 이 넷 밖의 키는 저장되지 않는다.
type Scope struct {
	LogView     bool `json:"logView"`
	RoutineEdit bool `json:"routineEdit"`
	BodyView    bool `json:"bodyView"`
	PastRecords bool `json:"pastRecords"`
}

// DefaultScope — 기록·루틴은 켜고, 체중·지난 기록은 끈다(신체정보 기본 제외).
func DefaultScope() Scope { return Scope{LogView: true, RoutineEdit: true} }

// ScopeOf는 저장된 범위(map)를 넷으로 읽는다. 없는 키는 false.
func ScopeOf(m map[string]bool) Scope {
	return Scope{
		LogView: m[ScopeLogView], RoutineEdit: m[ScopeRoutineEdit],
		BodyView: m[ScopeBodyView], PastRecords: m[ScopePastRecords],
	}
}

func (s Scope) asMap() map[string]bool {
	return map[string]bool{
		ScopeLogView: s.LogView, ScopeRoutineEdit: s.RoutineEdit,
		ScopeBodyView: s.BodyView, ScopePastRecords: s.PastRecords,
	}
}

func (s Scope) encode() []byte {
	b, _ := json.Marshal(s) // 필드가 bool 넷이라 실패하지 않는다
	return b
}

// visibleFrom은 코치가 볼 수 있는 가장 이른 시각이다 — pastRecords 면 제한 없음(제로), 아니면 동의 시각.
// 모든 회원 기록 RPC(GetMemberRecords·GetMemberReport · P4 Digest·코멘트)가 이 값 하나로 자른다.
func visibleFrom(g Grant) time.Time {
	if g.Scope[ScopePastRecords] {
		return time.Time{}
	}
	// [원본] return g.ConsentAt — 동의 시각이 비면(옛 이관 행) 제로가 되어 지난 기록이 다 열렸다(P1a 리뷰)
	// [개선] 비어 있으면 지금부터만 — 모르는 동의를 「전부 허용」으로 읽지 않는다
	if g.ConsentAt.IsZero() {
		return time.Now()
	}
	return g.ConsentAt
}

// Invite는 코치의 초대 코드 하나다.
type Invite struct {
	ID        string
	Code      string
	TrainerID string
	CreatedAt time.Time
	ExpiresAt time.Time
}

// RequestInput은 RequestCoaching 의 입력이다. 정확히 한쪽(TrainerID|MemberID)만 채운다.
type RequestInput struct {
	TrainerID string
	MemberID  string
	// 회원이 요청할 때만 쓴다. nil 이면 기본값.
	Scope *Scope
	Note  string
}

// RefNotifier는 코칭 알림 포트다 — 대상 id(ref_id)를 싣는다(post_id 는 비운다). main.go 의 notifyAdapter.
type RefNotifier interface {
	NotifyRef(ctx context.Context, userID, actorID, kind, refID string)
}

// DirectOpener는 1:1 대화방 포트다(dm.GetOrCreateDirect). 실패해도 연결은 성공이다.
type DirectOpener interface {
	OpenDirect(ctx context.Context, a, b string) error
}

// WithConnectPorts는 연결 알림·대화방 포트를 끼운다(main.go 조립). 없으면 조용히 건너뛴다.
func (s *Service) WithConnectPorts(n RefNotifier, d DirectOpener) *Service {
	s.refNotifier, s.direct = n, d
	return s
}

// WithInviteCode는 초대 코드 생성기를 바꾼다(테스트 · 충돌 재시도 확인).
func (s *Service) WithInviteCode(gen func() string) *Service {
	s.newCode = gen
	return s
}

// ── 범위 바꾸기 ───────────────────────────────────────────────────────────────

// UpdateScope는 회원이 활성 관계의 범위를 바꾼다. 코치는 못 바꾼다(범위는 회원의 동의다).
func (s *Service) UpdateScope(ctx context.Context, viewerID, grantID string, scope Scope) (Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Grant{}, err
	}
	g, err := s.repo.GetGrant(ctx, grantID)
	if err != nil {
		return Grant{}, err
	}
	switch sideOf(g, viewerID) {
	case "":
		return Grant{}, errs.New(errs.Forbidden, msgNotParty)
	case SideTrainer:
		return Grant{}, errs.New(errs.Forbidden, msgScopeMemberOnly)
	}
	if g.Status != StatusActive {
		return Grant{}, errs.New(errs.Conflict, msgNotActive)
	}
	if err := s.assertNotBlocked(ctx, g.TrainerID, g.MemberID); err != nil {
		return Grant{}, err
	}
	// 상태 조건은 쿼리에도 있다(AND status='active') — 그 사이 해지됐으면 0행 → Conflict.
	if _, err := s.repo.UpdateScope(ctx, grantID, scope.encode()); err != nil {
		return Grant{}, err
	}
	detail, _ := json.Marshal(map[string]any{"before": ScopeOf(g.Scope), "after": scope})
	s.audit(ctx, grantID, viewerID, ActionScopeChange, detail)
	return s.viewFor(ctx, grantID, viewerID)
}

// ── 초대 코드 ─────────────────────────────────────────────────────────────────

// CreateInvite는 코치가 새 코드를 만든다. 옛 코드는 같은 트랜잭션에서 회수된다(저장소).
func (s *Service) CreateInvite(ctx context.Context, viewerID string) (Invite, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Invite{}, err
	}
	// 코칭 의향을 밝힌 사람만 — 의향 없는 코드는 받는 쪽에서 어차피 막힌다.
	if err := s.assertTrainerEligible(ctx, viewerID); err != nil {
		return Invite{}, err
	}
	id := s.newID()
	expires := s.now().Add(inviteTTL)
	for i := 0; i < inviteCodeTries; i++ {
		inv, err := s.repo.CreateInvite(ctx, id, viewerID, s.newCode(), expires)
		if errors.Is(err, ErrInviteCodeTaken) {
			continue // 다른 코치의 살아 있는 코드와 겹쳤다 — 다시 뽑는다
		}
		if err != nil {
			return Invite{}, err
		}
		detail, _ := json.Marshal(map[string]any{"inviteId": inv.ID, "codeTail": codeTail(inv.Code)})
		s.audit(ctx, "", viewerID, ActionInviteCreate, detail)
		return inv, nil
	}
	return Invite{}, errs.New(errs.Unavailable, msgTryLater)
}

// GetMyInvite는 코치의 지금 살아 있는 코드다. 없거나 만료면 found=false.
func (s *Service) GetMyInvite(ctx context.Context, viewerID string) (Invite, bool, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Invite{}, false, err
	}
	inv, err := s.repo.GetLiveInviteByTrainer(ctx, viewerID)
	if err != nil {
		if isNotFound(err) {
			return Invite{}, false, nil
		}
		return Invite{}, false, err
	}
	if !s.now().Before(inv.ExpiresAt) {
		_ = s.repo.RevokeInvite(ctx, inv.ID)
		return Invite{}, false, nil
	}
	return inv, true, nil
}

// GetInvite는 회원이 코드로 코치 카드를 본다(연결 전).
//
//	만료·회수·없음·코치가 의향을 내림 → 모두 같은 NotFound(코드가 있었는지 알리지 않는다)
//	내 코드 → Validation 「내 초대 코드예요」 · 차단 사이 → NotFound(있는 줄도 모르게)
//	이미 다른 코치가 있다 → Conflict 「이미 코치가 있어요…」(화면이 범위 시트 전에 보인다)
func (s *Service) GetInvite(ctx context.Context, viewerID, code string) (Peer, Invite, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Peer{}, Invite{}, err
	}
	inv, err := s.liveInvite(ctx, code)
	if err != nil {
		return Peer{}, Invite{}, err
	}
	if err := s.checkInviteUsable(ctx, viewerID, inv); err != nil {
		return Peer{}, Invite{}, err
	}
	peer, err := s.repo.GetPeer(ctx, inv.TrainerID)
	if err != nil {
		if isNotFound(err) {
			return Peer{}, Invite{}, errs.New(errs.NotFound, msgInviteNotFound)
		}
		return Peer{}, Invite{}, err
	}
	return peer, inv, nil
}

// AcceptInvite는 회원(viewer)이 범위를 골라 코드의 코치와 바로 연결한다 — 이 호출이 동의다.
// 같은 쌍의 옛 관계(pending·revoked)는 같은 행을 되살린다.
func (s *Service) AcceptInvite(ctx context.Context, viewerID, code string, scope *Scope) (Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Grant{}, err
	}
	inv, err := s.liveInvite(ctx, code)
	if err != nil {
		return Grant{}, err
	}
	if err := s.checkInviteUsable(ctx, viewerID, inv); err != nil {
		return Grant{}, err
	}
	sc := DefaultScope()
	if scope != nil {
		sc = *scope
	}
	// 정본 확인 — 같은 쌍이 이미 활성이면 0행, 다른 코치와 활성이면 one_coach 23505(둘 다 저장소가 Conflict 로).
	g, err := s.repo.ActivateGrantFromInvite(ctx, s.newID(), inv.TrainerID, viewerID, sc.encode())
	if err != nil {
		return Grant{}, err
	}
	detail, _ := json.Marshal(map[string]any{"codeTail": codeTail(inv.Code), "scope": sc})
	s.audit(ctx, g.ID, viewerID, ActionInviteAccept, detail)
	s.notifyAfter(ctx, inv.TrainerID, viewerID, notifyKindCoachingAccept, g.ID)
	s.openDirect(ctx, viewerID, inv.TrainerID)
	return s.viewFor(ctx, g.ID, viewerID)
}

// liveInvite는 코드를 정리해 살아 있는 초대를 찾는다. 만료면 그 자리에서 회수하고 NotFound.
func (s *Service) liveInvite(ctx context.Context, raw string) (Invite, error) {
	code, ok := normalizeInviteCode(raw)
	if !ok {
		return Invite{}, errs.New(errs.NotFound, msgInviteNotFound)
	}
	inv, err := s.repo.GetLiveInviteByCode(ctx, code)
	if err != nil {
		if isNotFound(err) {
			return Invite{}, errs.New(errs.NotFound, msgInviteNotFound)
		}
		return Invite{}, err
	}
	if !s.now().Before(inv.ExpiresAt) {
		_ = s.repo.RevokeInvite(ctx, inv.ID)
		return Invite{}, errs.New(errs.NotFound, msgInviteNotFound)
	}
	return inv, nil
}

// checkInviteUsable — 본인 코드·차단·코치 의향·이미 다른 코치(앞선 확인).
func (s *Service) checkInviteUsable(ctx context.Context, viewerID string, inv Invite) error {
	if inv.TrainerID == viewerID {
		return errs.New(errs.Validation, msgOwnInvite)
	}
	blocked, err := s.repo.Blocked(ctx, inv.TrainerID, viewerID)
	if err != nil {
		return err
	}
	if blocked {
		return errs.New(errs.NotFound, msgInviteNotFound)
	}
	ok, err := s.repo.TrainerEligible(ctx, inv.TrainerID)
	if err != nil {
		if isNotFound(err) {
			return errs.New(errs.NotFound, msgInviteNotFound)
		}
		return err
	}
	if !ok {
		return errs.New(errs.NotFound, msgInviteNotFound)
	}
	other, err := s.repo.HasOtherActiveCoach(ctx, viewerID, inv.TrainerID)
	if err != nil {
		return err
	}
	if other {
		return errs.New(errs.Conflict, msgOneCoach)
	}
	return nil
}

// normalizeInviteCode — 하이픈·공백을 빼고 대문자로. Crockford 규칙대로 I·L→1, O→0 으로 읽는다.
// 8자 base32 가 아니면 ok=false(없는 코드와 같은 답을 준다).
func normalizeInviteCode(raw string) (string, bool) {
	var b strings.Builder
	for _, r := range strings.ToUpper(raw) {
		switch r {
		case '-', ' ', '\t':
			continue
		case 'I', 'L':
			r = '1'
		case 'O':
			r = '0'
		}
		if !strings.ContainsRune(crockfordAlphabet, r) {
			return "", false
		}
		b.WriteRune(r)
	}
	code := b.String()
	if len(code) != inviteCodeLen {
		return "", false
	}
	return code, true
}

// randomInviteCode — crypto/rand 로 8자(40비트).
func randomInviteCode() string {
	buf := make([]byte, inviteCodeLen)
	if _, err := rand.Read(buf); err != nil {
		panic(err) // OS 난수가 없으면 코드를 만들 수 없다
	}
	out := make([]byte, inviteCodeLen)
	for i, v := range buf {
		out[i] = crockfordAlphabet[int(v)%len(crockfordAlphabet)] // 256 = 32×8 이라 치우침이 없다
	}
	return string(out)
}

// codeTail — 감사에는 코드 끝 2자만 남긴다(전체 코드는 남기지 않는다).
func codeTail(code string) string {
	if len(code) <= 2 {
		return code
	}
	return code[len(code)-2:]
}

// ── 도우미 ───────────────────────────────────────────────────────────────────

func (s *Service) assertNotBlocked(ctx context.Context, a, b string) error {
	blocked, err := s.repo.Blocked(ctx, a, b)
	if err != nil {
		return err
	}
	if blocked {
		return errs.New(errs.Forbidden, msgBlocked)
	}
	return nil
}

// cleanNote — 앞뒤 공백을 걷고 100자(룬)를 넘으면 거절.
func cleanNote(note string) (string, error) {
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > maxRequestNoteRunes {
		return "", errs.New(errs.Validation, msgNoteTooLong, maxRequestNoteRunes)
	}
	return note, nil
}

// notifyAfter는 **커밋 뒤에** 부른다. 차단 사이면 보내지 않고, 실패해도 본 동작을 막지 않는다.
func (s *Service) notifyAfter(ctx context.Context, to, actor, kind, refID string) {
	if s.refNotifier == nil || to == "" || to == actor {
		return
	}
	if blocked, err := s.repo.Blocked(ctx, to, actor); err != nil || blocked {
		return
	}
	s.refNotifier.NotifyRef(ctx, to, actor, kind, refID)
}

// openDirect는 수락 뒤 1:1 대화방을 만들어 둔다. 실패는 무시한다(연결은 이미 성공했다).
func (s *Service) openDirect(ctx context.Context, a, b string) {
	if s.direct == nil {
		return
	}
	_ = s.direct.OpenDirect(ctx, a, b)
}

func otherSide(g Grant, viewerID string) string {
	if viewerID == g.TrainerID {
		return g.MemberID
	}
	return g.TrainerID
}
