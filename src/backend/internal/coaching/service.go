// @plm SRS-048  코칭 규칙 — 누가 누구를 볼 수 있는가 (SAD-022 · ADR-028)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 지키는 것 넷:
//
//	① **동의 없이는 열리지 않는다** — 요청은 어느 쪽이든 걸지만 수락은 반대편만 한다
//	② **범위 밖은 못 본다** — 루틴 편집·스케줄 편집·기록 열람 셋뿐(신체 정보는 목록에 없다)
//	③ **해지하면 그 순간 닫힌다** — 활성이 아닌 관계로는 아무것도 읽지 못한다
//	④ **본 것은 남는다** — 열람도 기록이다(고친 것만 남기면 감시가 보이지 않는다)
//
// ── 왜 요청한 사람이 수락할 수 없나 ────────────────────────────────────────
// 스스로 수락할 수 있으면 그건 동의가 아니라 통보다. 트레이너가 회원을 지정하고 스스로 수락하면
// 회원 모르게 기록이 열린다 — 이 한 줄이 그 경로를 막는다.
//
// ── 서버는 처방하지 않는다 ──────────────────────────────────────────────────
// 리포트는 **사실 집계만** 한다(ADR-028). "이 부위가 부족합니다" 같은 판단은 넣지 않는다 —
// 그 말은 트레이너가 할 말이고, 서버가 하면 근거 없는 처방이 된다.
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 열리는 범위. **신체 정보는 여기 없다** — 기본 제외 원칙이라 목록에 아예 두지 않는다.
const (
	ScopeRoutineEdit  = "routineEdit"
	ScopeScheduleEdit = "scheduleEdit"
	ScopeLogView      = "logView"
)

// 관계에서 내가 어느 쪽인가.
const (
	SideTrainer = "trainer"
	SideMember  = "member"
)

const (
	StatusPending = "pending"
	StatusActive  = "active"
	StatusRevoked = "revoked"
)

// 감사 기록에 남는 행동. **열람도 남긴다** — 고친 것만 남기면 감시가 보이지 않는다.
const (
	ActionRequest          = "request"
	ActionAccept           = "accept"
	ActionRevoke           = "revoke"
	ActionReportView       = "report_view"
	ActionRoutinesView     = "routines_view"
	ActionPrescriptionEdit = "prescription_edit"
	// summary_send·summary_view·records_view 는 summary.go(SRS-080) — 목록 전체는 0017 주석.
)

type Peer struct {
	ID              string
	DisplayName     string
	AvatarURL       string
	ExperienceLevel string
	TrainerIntent   bool
	// 코치 소개·태그(SPEC-050). 태그는 nil 대신 빈 슬라이스.
	CoachBio  string
	CoachTags []string
}

type Grant struct {
	ID          string
	TrainerID   string
	MemberID    string
	Status      string
	Scope       map[string]bool
	RequestedBy string
	ConsentAt   time.Time
	CreatedAt   time.Time
	// 요청할 때 남긴 한 줄(SPEC-050).
	RequestNote string
	// 보는 사람 기준으로 채운다 — 같은 행을 양쪽이 보기 때문이다.
	RoleOfMe string
	Peer     Peer
}

type AuditEntry struct {
	ID        string
	ActorID   string
	Action    string
	CreatedAt time.Time
}

// MemberRecord는 회원이 동기해 둔 레코드 하나다. 서버는 이 payload를 **읽기만** 한다
// (처방을 쓸 때만 예외인데, 그때도 한 필드만 건드린다).
type MemberRecord struct {
	Collection string
	RecordID   string
	Payload    []byte
}

type Repo interface {
	SearchTrainers(ctx context.Context, viewerID, query string) ([]Peer, error)
	// TrainerEligible은 그 사람이 코칭 의향을 밝혔는지 본다. 없으면 NotFound.
	TrainerEligible(ctx context.Context, trainerID string) (bool, error)
	UserExists(ctx context.Context, userID string) (bool, error)
	Blocked(ctx context.Context, a, b string) (bool, error)

	GetGrant(ctx context.Context, grantID string) (Grant, error)
	GetGrantByPair(ctx context.Context, trainerID, memberID string) (Grant, error)
	ListGrants(ctx context.Context, viewerID string) ([]Grant, error)
	// [원본] CreateGrant(ctx, id, trainerID, memberID, requestedBy string) (Grant, error)
	// [원본] ReopenGrant(ctx, grantID, requestedBy string) (Grant, error)
	// [원본] AcceptGrant(ctx, grantID string) (Grant, error)
	// [개선] SPEC-050 — 범위·한 줄 메시지를 함께 쓰고, 상태 조건은 쿼리에 둔다(0행이면 Conflict).
	CreateGrant(ctx context.Context, id, trainerID, memberID, requestedBy string, scope []byte, note string) (Grant, error)
	// ReopenGrant는 revoked 행만 되살린다. 범위는 넘긴 값으로 덮는다(옛 범위가 되살아나지 않게).
	ReopenGrant(ctx context.Context, grantID, requestedBy string, scope []byte, note string) (Grant, error)
	// AcceptGrant는 pending 일 때만. scope 가 nil 이면 저장된 값을 둔다. 다른 코치와 활성이면 Conflict(one_coach).
	AcceptGrant(ctx context.Context, grantID string, scope []byte) (Grant, error)
	// [원본] 해지 — 서비스는 이제 RevokeGrantAndEndRoutines 를 쓴다(구현은 남겨 둔다).
	RevokeGrant(ctx context.Context, grantID string) (Grant, error)
	// RevokeGrantAndEndRoutines는 한 트랜잭션: grant FOR UPDATE → revoked(이미 revoked 면 Conflict) →
	// 회원 sync 루틴에 origin coach_ended 패치(P3b) → 그 관계의 활성 coaching_routines → ended.
	RevokeGrantAndEndRoutines(ctx context.Context, grantID string) (Grant, error)
	// UpdateScope는 active 일 때만(0행이면 Conflict).
	UpdateScope(ctx context.Context, grantID string, scope []byte) (Grant, error)
	// HasOtherActiveCoach — 이 회원에게 exceptTrainerID 가 아닌 활성 코치가 있는가.
	HasOtherActiveCoach(ctx context.Context, memberID, exceptTrainerID string) (bool, error)
	// ActivateGrantFromInvite — 초대 코드 연결(같은 쌍은 되살림 · 이미 활성이면 Conflict · 다른 코치면 Conflict).
	ActivateGrantFromInvite(ctx context.Context, id, trainerID, memberID string, scope []byte) (Grant, error)
	// GetPeer — 한 사람의 공개 카드(없으면 NotFound).
	GetPeer(ctx context.Context, userID string) (Peer, error)

	// 초대 코드(SPEC-050). CreateInvite는 한 트랜잭션: 그 코치의 옛 코드 회수 → 넣기.
	// 다른 코치의 살아 있는 코드와 겹치면 ErrInviteCodeTaken.
	CreateInvite(ctx context.Context, id, trainerID, code string, expiresAt time.Time) (Invite, error)
	GetLiveInviteByCode(ctx context.Context, code string) (Invite, error)
	GetLiveInviteByTrainer(ctx context.Context, trainerID string) (Invite, error)
	RevokeInvite(ctx context.Context, id string) error
	// 체중·인바디(bodyView 일 때만) — [from, to)에 잰 기록. 읽은 바이트는 budget 에서 뺀다.
	ListMemberBodyweightIn(ctx context.Context, memberID string, fromMs, toMs int64, b *ReadBudget) ([]MemberRecord, error)

	Audit(ctx context.Context, id, grantID, actorID, action string, detail []byte) error
	// AuditOnce는 since 뒤에 같은 (grant, actor, action[, detail])이 있으면 쓰지 않는다(열람 반복 · CS-7).
	AuditOnce(ctx context.Context, id, grantID, actorID, action string, detail []byte, since time.Time, matchDetail bool) error
	ListAudit(ctx context.Context, grantID string) ([]AuditEntry, error)

	ListMemberRecords(ctx context.Context, memberID string, collections []string) ([]MemberRecord, error)
	// GetMemberRecords 용 — SQL 이 기간·부모 id 로 거르고, 읽은 바이트를 budget 에서 뺀다(CS-4). @plm SRS-080
	ListMemberWorkoutsStartedIn(ctx context.Context, memberID string, fromMs, toMs int64, b *ReadBudget) ([]MemberRecord, error)
	ListMemberRecordsByParent(ctx context.Context, memberID, collection, parentField string, parentIDs []string, b *ReadBudget) ([]MemberRecord, error)
	ListMemberRecordsByIDs(ctx context.Context, memberID, collection string, ids []string, b *ReadBudget) ([]MemberRecord, error)
	// 서버 카탈로그(시드 종목)의 이름·주 근육 — 종목 해석의 정본(QA H4). @plm SRS-048 SRS-055
	CatalogMeta(ctx context.Context) (map[string]CatalogExercise, error)
	GetMemberRecord(ctx context.Context, memberID, collection, recordID string) (rowID string, payload []byte, err error)
	UpdateMemberRecord(ctx context.Context, rowID string, payload []byte) error

	// 기간 성과 요약(progress_summaries · 0017). @plm SRS-080
	SummaryRepo
	// 코치 루틴 보내기(coaching_routines · SPEC-050 P3b) — routines.go.
	RoutineRepo
	// 코치 코멘트·담당 회원 점검(coaching_comments · SPEC-050 P4) — comments.go.
	CommentRepo
}

type Service struct {
	repo  Repo
	newID func() string
	now   func() time.Time
	// 요약 전달(SRS-080) — WithSummaryDelivery 로 끼운다. dm 의 좁은 포트·알림 포트만 안다.
	messenger SummaryMessenger
	notifier  Notifier
	// 연결 알림(ref_id)·대화방(SPEC-050) — WithConnectPorts 로 끼운다.
	refNotifier RefNotifier
	direct      DirectOpener
	// 초대 코드 생성기 — 기본은 crypto/rand(WithInviteCode 로 바꾼다).
	newCode func() string
}

func NewService(repo Repo, newID func() string, now func() time.Time) *Service {
	return &Service{repo: repo, newID: newID, now: now, newCode: randomInviteCode}
}

func requireIdentity(viewerID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "login required")
	}
	return nil
}

// SearchTrainers는 코칭 의향을 밝힌 사람을 찾는다. 차단 관계는 저장소가 걸러 낸다.
func (s *Service) SearchTrainers(ctx context.Context, viewerID, query string) ([]Peer, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	return s.repo.SearchTrainers(ctx, viewerID, query)
}

// Request는 코칭 관계를 건다. **정확히 한쪽만** 지정해야 한다 —
// 둘 다 비거나 둘 다 채우면 누가 가르치는지 알 수 없다.
// [개선] SPEC-050 — 범위·메시지 없는 옛 모양은 RequestCoaching(기본 범위)으로 넘긴다.
func (s *Service) Request(ctx context.Context, viewerID, trainerID, memberID string) (Grant, error) {
	return s.RequestCoaching(ctx, viewerID, RequestInput{TrainerID: trainerID, MemberID: memberID})
}

// RequestCoaching은 범위·한 줄 메시지와 함께 관계를 건다(SPEC-050).
// 회원이 요청하면 그 범위(없으면 기본값)를 저장하고, 코치가 요청하면 기본값 — 회원이 수락할 때 고친다.
func (s *Service) RequestCoaching(ctx context.Context, viewerID string, in RequestInput) (Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Grant{}, err
	}
	trainerID, memberID := in.TrainerID, in.MemberID
	note, err := cleanNote(in.Note)
	if err != nil {
		return Grant{}, err
	}
	asMember := trainerID != ""
	if asMember == (memberID != "") {
		return Grant{}, errs.New(errs.Validation, "specify exactly one of trainerId|memberId")
	}
	if asMember {
		memberID = viewerID
	} else {
		trainerID = viewerID
	}
	if trainerID == memberID {
		return Grant{}, errs.New(errs.Validation, "cannot coach yourself")
	}

	// 차단한 사이에는 코칭도 없다. 다른 곳(피드·DM)과 같은 판단이다.
	blocked, err := s.repo.Blocked(ctx, trainerID, memberID)
	if err != nil {
		return Grant{}, err
	}
	if blocked {
		return Grant{}, errs.New(errs.Forbidden, "blocked relation")
	}
	if err := s.assertTrainerEligible(ctx, trainerID); err != nil {
		return Grant{}, err
	}
	exists, err := s.repo.UserExists(ctx, memberID)
	if err != nil {
		return Grant{}, err
	}
	if !exists {
		return Grant{}, errs.New(errs.NotFound, "member not found")
	}

	requestedBy := SideTrainer
	scope := DefaultScope()
	if asMember {
		requestedBy = SideMember
		if in.Scope != nil {
			scope = *in.Scope
		}
		// 코치는 한 명(앞선 확인 — 정본은 수락 때의 one_coach 인덱스).
		other, err := s.repo.HasOtherActiveCoach(ctx, memberID, trainerID)
		if err != nil {
			return Grant{}, err
		}
		if other {
			return Grant{}, errs.New(errs.Conflict, msgOneCoach)
		}
	}

	existing, err := s.repo.GetGrantByPair(ctx, trainerID, memberID)
	switch {
	case err == nil && existing.Status != StatusRevoked:
		// 이미 걸려 있다. 같은 요청을 두 번 보내도 새 관계가 생기지 않는다.
		return Grant{}, errs.New(errs.Conflict, "request already exists")
	case err == nil:
		// 해지된 관계 — **같은 행을 되살린다**(이력은 감사 기록이 보존한다).
		// [원본] g, err := s.repo.ReopenGrant(ctx, existing.ID, requestedBy) — 옛 범위가 되살아났다(REV-097)
		// [개선] 범위는 이번 요청값(없으면 기본값)으로 덮는다.
		g, err := s.repo.ReopenGrant(ctx, existing.ID, requestedBy, scope.encode(), note)
		if err != nil {
			return Grant{}, err
		}
		return s.finishRequest(ctx, g, viewerID)
	case isNotFound(err):
		// [원본] g, err := s.repo.CreateGrant(ctx, s.newID(), trainerID, memberID, requestedBy)
		g, err := s.repo.CreateGrant(ctx, s.newID(), trainerID, memberID, requestedBy, scope.encode(), note)
		if err != nil {
			return Grant{}, err
		}
		return s.finishRequest(ctx, g, viewerID)
	default:
		return Grant{}, err
	}
}

func (s *Service) finishRequest(ctx context.Context, g Grant, viewerID string) (Grant, error) {
	s.audit(ctx, g.ID, viewerID, ActionRequest, nil)
	// 받는 쪽 = 반대편(SPEC-050) — 커밋 뒤, 차단이면 보내지 않는다.
	s.notifyAfter(ctx, otherSide(g, viewerID), viewerID, notifyKindCoachingRequest, g.ID)
	return s.viewFor(ctx, g.ID, viewerID)
}

// Accept는 동의다. **요청한 쪽은 부를 수 없다** — 그러면 동의가 아니라 통보다.
// [개선] SPEC-050 — 범위 없는 옛 모양은 AcceptWith(저장된 범위)로 넘긴다.
func (s *Service) Accept(ctx context.Context, viewerID, grantID string) (Grant, error) {
	return s.AcceptWith(ctx, viewerID, grantID, nil)
}

// AcceptWith는 수락하면서 범위를 받는다 — **회원이 수락할 때만** 저장하고(nil 이면 저장된 값),
// 코치가 수락하면 무시한다(범위는 회원의 동의다).
func (s *Service) AcceptWith(ctx context.Context, viewerID, grantID string, scope *Scope) (Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Grant{}, err
	}
	g, err := s.repo.GetGrant(ctx, grantID)
	if err != nil {
		return Grant{}, err
	}
	side := sideOf(g, viewerID)
	if side == "" {
		return Grant{}, errs.New(errs.Forbidden, "not a party")
	}
	if g.Status != StatusPending {
		return Grant{}, errs.New(errs.Validation, "not pending")
	}
	if side == g.RequestedBy {
		return Grant{}, errs.New(errs.Forbidden, "requester cannot accept")
	}
	// 수락 시점에 다시 확인한다 — 요청한 뒤 트레이너가 의향을 내렸을 수 있다.
	if err := s.assertTrainerEligible(ctx, g.TrainerID); err != nil {
		return Grant{}, err
	}
	// 차단 재확인(SPEC-050) — 요청한 뒤 차단했을 수 있다.
	if err := s.assertNotBlocked(ctx, g.TrainerID, g.MemberID); err != nil {
		return Grant{}, err
	}
	var scopeJSON []byte
	if side == SideMember && scope != nil {
		scopeJSON = scope.encode()
	}

	// [원본] if _, err := s.repo.AcceptGrant(ctx, grantID); err != nil {
	// [개선] 쿼리가 pending 을 다시 보고(0행 → Conflict), one_coach 인덱스가 둘째 코치를 막는다(23505 → Conflict).
	if _, err := s.repo.AcceptGrant(ctx, grantID, scopeJSON); err != nil {
		var de *errs.DomainError
		if side == SideTrainer && errors.As(err, &de) && de.Message == msgOneCoach {
			return Grant{}, errs.New(errs.Conflict, msgMemberHasCoach)
		}
		return Grant{}, err
	}
	s.audit(ctx, grantID, viewerID, ActionAccept, nil)
	s.notifyAfter(ctx, otherSide(g, viewerID), viewerID, notifyKindCoachingAccept, grantID)
	s.openDirect(ctx, g.TrainerID, g.MemberID)
	return s.viewFor(ctx, grantID, viewerID)
}

// Revoke는 **양쪽 다** 할 수 있다. 회원이 언제든 닫을 수 없으면 그건 동의가 아니다.
func (s *Service) Revoke(ctx context.Context, viewerID, grantID string) (Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Grant{}, err
	}
	g, err := s.repo.GetGrant(ctx, grantID)
	if err != nil {
		return Grant{}, err
	}
	if sideOf(g, viewerID) == "" {
		return Grant{}, errs.New(errs.Forbidden, "not a party")
	}
	if g.Status == StatusRevoked {
		return Grant{}, errs.New(errs.Validation, "already revoked")
	}
	// [원본] if _, err := s.repo.RevokeGrant(ctx, grantID); err != nil {
	// [개선] SPEC-050 — grant 를 잠그고 해지 + 그 관계의 코치 루틴을 끝낸다(한 트랜잭션 · 루틴 보내기와 경합 방지).
	if _, err := s.repo.RevokeGrantAndEndRoutines(ctx, grantID); err != nil {
		return Grant{}, err
	}
	s.audit(ctx, grantID, viewerID, ActionRevoke, nil)
	s.notifyAfter(ctx, otherSide(g, viewerID), viewerID, notifyKindCoachingRevoke, grantID)
	return s.viewFor(ctx, grantID, viewerID)
}

func (s *Service) ListGrants(ctx context.Context, viewerID string) ([]Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	return s.repo.ListGrants(ctx, viewerID)
}

// ListAudit은 코칭 이력을 돌려준다. **당사자 둘 다** 읽을 수 있다 —
// 감시받는 쪽이 감시 기록을 볼 수 없으면 신뢰 장치가 아니다.
func (s *Service) ListAudit(ctx context.Context, viewerID, grantID string) ([]AuditEntry, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	g, err := s.repo.GetGrant(ctx, grantID)
	if err != nil {
		return nil, err
	}
	if sideOf(g, viewerID) == "" {
		return nil, errs.New(errs.Forbidden, "not a party")
	}
	return s.repo.ListAudit(ctx, grantID)
}

// ── 회원 데이터 접근 ─────────────────────────────────────────────────────────

// assertActiveGrant는 이 트레이너가 이 회원에 대해 **지금** 그 범위를 가졌는지 본다.
// 해지된 관계·범위 밖은 여기서 전부 막힌다.
func (s *Service) assertActiveGrant(ctx context.Context, trainerID, memberID, scope string) (Grant, error) {
	g, err := s.repo.GetGrantByPair(ctx, trainerID, memberID)
	if err != nil {
		if isNotFound(err) {
			return Grant{}, errs.New(errs.Forbidden, "no active coaching grant")
		}
		return Grant{}, err
	}
	if g.Status != StatusActive {
		return Grant{}, errs.New(errs.Forbidden, "no active coaching grant")
	}
	if !g.Scope[scope] {
		return Grant{}, errs.New(errs.Forbidden, "scope %s not granted", scope)
	}
	return g, nil
}

// assertCoachingAccess는 assertActiveGrant + **차단 아님**이다(CS-3). 회원 데이터에 닿는 모든 코칭 경로
// (옛 리포트·루틴·처방 · 요약 보내기·열기 · 원본 레코드)가 이것을 쓴다 — 회원이 트레이너를 차단하면
// grant 가 active 로 남아 있어도 그 순간부터 읽기·쓰기가 모두 막힌다(SRS-048 3조건). 어느 쪽이 차단했든 같다.
func (s *Service) assertCoachingAccess(ctx context.Context, trainerID, memberID, scope string) (Grant, error) {
	g, err := s.assertActiveGrant(ctx, trainerID, memberID, scope)
	if err != nil {
		return Grant{}, err
	}
	blocked, err := s.repo.Blocked(ctx, trainerID, memberID)
	if err != nil {
		return Grant{}, err
	}
	if blocked {
		return Grant{}, errs.New(errs.Forbidden, "blocked relation")
	}
	return g, nil
}

// GetMemberReport는 회원이 동기해 둔 기록을 **그 자리에서** 집계한다.
// 복사해 두지 않는 이유: 해지한 뒤에도 남아 있게 되기 때문이다.
func (s *Service) GetMemberReport(ctx context.Context, viewerID, memberID string) (Report, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Report{}, err
	}
	g, err := s.assertCoachingAccess(ctx, viewerID, memberID, ScopeLogView)
	if err != nil {
		return Report{}, err
	}
	// **열람도 남긴다.** 회원이 "언제 무엇을 봤는지" 확인할 수 있어야 한다.
	s.audit(ctx, g.ID, viewerID, ActionReportView, nil)

	recs, err := s.repo.ListMemberRecords(ctx, memberID, reportCollections)
	if err != nil {
		return Report{}, err
	}
	catalog, err := s.repo.CatalogMeta(ctx)
	if err != nil {
		return Report{}, err
	}
	// [원본] return buildReportWith(recs, catalog, s.now()), nil
	// [개선] SPEC-050 — 지난 기록을 열지 않았으면 동의 시각 앞의 운동은 세지 않는다(visibleFrom).
	return buildReportSince(recs, catalog, s.now(), visibleFrom(g)), nil
}

// ListMemberRoutines는 회원의 루틴과 현재 처방을 돌려준다.
// 열람도 `routineEdit` 범위로 묶는다 — 고치려면 봐야 하고, 보기만 하는 별도 권한은 두지 않는다.
func (s *Service) ListMemberRoutines(ctx context.Context, viewerID, memberID string) ([]Routine, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	g, err := s.assertCoachingAccess(ctx, viewerID, memberID, ScopeRoutineEdit)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, g.ID, viewerID, ActionRoutinesView, nil)

	recs, err := s.repo.ListMemberRecords(ctx, memberID, routineCollections)
	if err != nil {
		return nil, err
	}
	catalog, err := s.repo.CatalogMeta(ctx)
	if err != nil {
		return nil, err
	}
	return buildRoutinesWith(recs, catalog), nil
}

// SetMemberPrescription은 회원의 루틴 종목에 처방을 써 넣는다.
//
// 회원의 레코드를 직접 고치는 **유일한 자리**라 조심스럽게 다룬다:
//   - 건드리는 필드는 `prescription`(과 그에 따른 `target_sets`)뿐이다
//   - 값은 서버가 다시 정리한다 — 앱을 거치지 않고 들어오는 경로가 있기 때문이다
//   - `updated_at`이 움직여야 회원 기기가 다음 동기에서 받는다
//
// **알려진 한계(LWW)**: 회원이 같은 레코드를 오프라인에서 고쳐 두었다가 나중에 올리면
// 트레이너의 처방이 덮인다. 충돌 해소는 동기 프로토콜의 다음 과제다.
func (s *Service) SetMemberPrescription(
	ctx context.Context, viewerID, memberID, routineID, routineExerciseID string, rx []PrescribedSet,
) ([]PrescribedSet, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	g, err := s.assertCoachingAccess(ctx, viewerID, memberID, ScopeRoutineEdit)
	if err != nil {
		return nil, err
	}

	clean := SanitizePrescription(rx)

	rowID, payload, err := s.repo.GetMemberRecord(ctx, memberID, "routine_exercises", routineExerciseID)
	if err != nil {
		return nil, err
	}
	var rec map[string]json.RawMessage
	if err := json.Unmarshal(payload, &rec); err != nil {
		return nil, errs.New(errs.NotFound, "routine exercise not readable")
	}
	// 다른 루틴의 종목을 고치려는 요청은 막는다 — 화면이 보내는 짝이 맞아야 한다.
	var gotRoutine string
	if raw, ok := rec["routine_id"]; ok {
		_ = json.Unmarshal(raw, &gotRoutine)
	}
	if gotRoutine != routineID {
		return nil, errs.New(errs.Validation, "routine mismatch")
	}
	// [개선] SPEC-050 P3b — 코치가 보낸 루틴(coach)은 초안을 고쳐 다시 보내고, 코칭이 끝난 루틴(coach_ended)은 회원 것이다.
	//   여기서 고치면 회원 잠금·출처가 어긋난다(sync/coach_guard.go 와 같은 판단 — id 가 coach- 면 코치 루틴).
	if _, rp, err := s.repo.GetMemberRecord(ctx, memberID, "routines", routineID); err == nil {
		switch coachOriginOf(routineID, rp) {
		case originCoach:
			return nil, errs.New(errs.Validation, msgCoachRoutineRx)
		case originCoachEnded:
			return nil, errs.New(errs.Validation, msgEndedRoutineRx)
		}
	} else if !isNotFound(err) {
		return nil, err
	} else if strings.HasPrefix(routineID, coachIDPrefix) {
		return nil, errs.New(errs.Validation, msgCoachRoutineRx)
	}

	// WatermelonDB 규약: `@json` 컬럼은 **직렬화된 문자열**로 들어간다.
	if len(clean) == 0 {
		rec["prescription"] = json.RawMessage("null")
	} else {
		// [원본] encoded, err := json.Marshal(clean) — 코치 저장이 회원의 시작 무게를 지웠다(REV-028)
		var stored []PrescribedSet
		var storedText string
		if raw, ok := rec["prescription"]; ok && json.Unmarshal(raw, &storedText) == nil {
			_ = json.Unmarshal([]byte(storedText), &stored)
		}
		encoded, err := json.Marshal(KeepMemberStart(clean, stored))
		if err != nil {
			return nil, err
		}
		asString, err := json.Marshal(string(encoded))
		if err != nil {
			return nil, err
		}
		rec["prescription"] = asString
		// 처방 줄 수가 곧 세트 수다 — 편집기와 같은 규칙이라 두 화면이 어긋나지 않는다.
		if sets, err := json.Marshal(len(clean)); err == nil {
			rec["target_sets"] = sets
		}
	}

	next, err := json.Marshal(rec)
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateMemberRecord(ctx, rowID, next); err != nil {
		return nil, err
	}

	detail, _ := json.Marshal(map[string]any{
		"routineId": routineID, "routineExerciseId": routineExerciseID, "sets": len(clean),
	})
	s.audit(ctx, g.ID, viewerID, ActionPrescriptionEdit, detail)
	return clean, nil
}

// ── 도우미 ───────────────────────────────────────────────────────────────────

func (s *Service) assertTrainerEligible(ctx context.Context, trainerID string) error {
	ok, err := s.repo.TrainerEligible(ctx, trainerID)
	if err != nil {
		if isNotFound(err) {
			return errs.New(errs.NotFound, "trainer not found")
		}
		return err
	}
	if !ok {
		// 코칭 의향을 밝히지 않은 사람에게는 걸 수 없다. **자격 심사가 아니라 의사 확인**이다.
		return errs.New(errs.Validation, "trainer has not enabled coaching")
	}
	return nil
}

// audit은 실패해도 본 동작을 막지 않는다 — 기록을 남기지 못했다고 해서
// 이미 일어난 수락·해지를 되돌릴 수는 없다(되돌리면 화면과 DB가 갈라진다).
func (s *Service) audit(ctx context.Context, grantID, actorID, action string, detail []byte) {
	_ = s.repo.Audit(ctx, s.newID(), grantID, actorID, action, detail)
}

// auditOnce는 window 안에 같은 열람이 있으면 남기지 않는다(CS-7). 실패해도 본 동작을 막지 않는다.
func (s *Service) auditOnce(ctx context.Context, grantID, actorID, action string, detail []byte, window time.Duration, matchDetail bool) {
	_ = s.repo.AuditOnce(ctx, s.newID(), grantID, actorID, action, detail, s.now().Add(-window), matchDetail)
}

func (s *Service) viewFor(ctx context.Context, grantID, viewerID string) (Grant, error) {
	grants, err := s.repo.ListGrants(ctx, viewerID)
	if err != nil {
		return Grant{}, err
	}
	for _, g := range grants {
		if g.ID == grantID {
			return g, nil
		}
	}
	return Grant{}, errs.New(errs.NotFound, "grant not found")
}

func sideOf(g Grant, userID string) string {
	switch userID {
	case g.TrainerID:
		return SideTrainer
	case g.MemberID:
		return SideMember
	}
	return ""
}

func isNotFound(err error) bool {
	var de *errs.DomainError
	if errors.As(err, &de) {
		return de.Code == errs.NotFound
	}
	return false
}
