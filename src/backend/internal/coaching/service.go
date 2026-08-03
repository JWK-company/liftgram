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
)

type Peer struct {
	ID              string
	DisplayName     string
	AvatarURL       string
	ExperienceLevel string
	TrainerIntent   bool
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
	CreateGrant(ctx context.Context, id, trainerID, memberID, requestedBy string) (Grant, error)
	ReopenGrant(ctx context.Context, grantID, requestedBy string) (Grant, error)
	AcceptGrant(ctx context.Context, grantID string) (Grant, error)
	RevokeGrant(ctx context.Context, grantID string) (Grant, error)

	Audit(ctx context.Context, id, grantID, actorID, action string, detail []byte) error
	ListAudit(ctx context.Context, grantID string) ([]AuditEntry, error)

	ListMemberRecords(ctx context.Context, memberID string, collections []string) ([]MemberRecord, error)
	GetMemberRecord(ctx context.Context, memberID, collection, recordID string) (rowID string, payload []byte, err error)
	UpdateMemberRecord(ctx context.Context, rowID string, payload []byte) error
}

type Service struct {
	repo  Repo
	newID func() string
	now   func() time.Time
}

func NewService(repo Repo, newID func() string, now func() time.Time) *Service {
	return &Service{repo: repo, newID: newID, now: now}
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
func (s *Service) Request(ctx context.Context, viewerID, trainerID, memberID string) (Grant, error) {
	if err := requireIdentity(viewerID); err != nil {
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
	if asMember {
		requestedBy = SideMember
	}

	existing, err := s.repo.GetGrantByPair(ctx, trainerID, memberID)
	switch {
	case err == nil && existing.Status != StatusRevoked:
		// 이미 걸려 있다. 같은 요청을 두 번 보내도 새 관계가 생기지 않는다.
		return Grant{}, errs.New(errs.Conflict, "request already exists")
	case err == nil:
		// 해지된 관계 — **같은 행을 되살린다**(이력은 감사 기록이 보존한다).
		g, err := s.repo.ReopenGrant(ctx, existing.ID, requestedBy)
		if err != nil {
			return Grant{}, err
		}
		return s.finishRequest(ctx, g, viewerID)
	case isNotFound(err):
		g, err := s.repo.CreateGrant(ctx, s.newID(), trainerID, memberID, requestedBy)
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
	return s.viewFor(ctx, g.ID, viewerID)
}

// Accept는 동의다. **요청한 쪽은 부를 수 없다** — 그러면 동의가 아니라 통보다.
func (s *Service) Accept(ctx context.Context, viewerID, grantID string) (Grant, error) {
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

	if _, err := s.repo.AcceptGrant(ctx, grantID); err != nil {
		return Grant{}, err
	}
	s.audit(ctx, grantID, viewerID, ActionAccept, nil)
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
	if _, err := s.repo.RevokeGrant(ctx, grantID); err != nil {
		return Grant{}, err
	}
	s.audit(ctx, grantID, viewerID, ActionRevoke, nil)
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

// GetMemberReport는 회원이 동기해 둔 기록을 **그 자리에서** 집계한다.
// 복사해 두지 않는 이유: 해지한 뒤에도 남아 있게 되기 때문이다.
func (s *Service) GetMemberReport(ctx context.Context, viewerID, memberID string) (Report, error) {
	if err := requireIdentity(viewerID); err != nil {
		return Report{}, err
	}
	g, err := s.assertActiveGrant(ctx, viewerID, memberID, ScopeLogView)
	if err != nil {
		return Report{}, err
	}
	// **열람도 남긴다.** 회원이 "언제 무엇을 봤는지" 확인할 수 있어야 한다.
	s.audit(ctx, g.ID, viewerID, ActionReportView, nil)

	recs, err := s.repo.ListMemberRecords(ctx, memberID, reportCollections)
	if err != nil {
		return Report{}, err
	}
	return buildReport(recs, s.now()), nil
}

// ListMemberRoutines는 회원의 루틴과 현재 처방을 돌려준다.
// 열람도 `routineEdit` 범위로 묶는다 — 고치려면 봐야 하고, 보기만 하는 별도 권한은 두지 않는다.
func (s *Service) ListMemberRoutines(ctx context.Context, viewerID, memberID string) ([]Routine, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	g, err := s.assertActiveGrant(ctx, viewerID, memberID, ScopeRoutineEdit)
	if err != nil {
		return nil, err
	}
	s.audit(ctx, g.ID, viewerID, ActionRoutinesView, nil)

	recs, err := s.repo.ListMemberRecords(ctx, memberID, routineCollections)
	if err != nil {
		return nil, err
	}
	return buildRoutines(recs), nil
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
	g, err := s.assertActiveGrant(ctx, viewerID, memberID, ScopeRoutineEdit)
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

	// WatermelonDB 규약: `@json` 컬럼은 **직렬화된 문자열**로 들어간다.
	if len(clean) == 0 {
		rec["prescription"] = json.RawMessage("null")
	} else {
		encoded, err := json.Marshal(clean)
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
