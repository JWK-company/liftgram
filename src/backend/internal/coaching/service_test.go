// @plm SRS-048  코칭 규칙 테스트
//
// 여기서 지키는 것은 전부 **남의 기록에 손대는 일**에 관한 것이다:
//
//	· 요청한 사람이 자기 요청을 수락할 수 없다(동의 ≠ 통보)
//	· 해지하면 그 순간 닫힌다 — 활성이 아닌 관계로는 아무것도 못 읽는다
//	· 범위 밖은 못 본다 · 깨진 범위 설정은 **아무것도 열지 않는다**
//	· 본 것도 남는다(열람 감사)
//	· 리포트는 사실만 — 워밍업·실패·미체크 세트는 세지 않는다
package coaching

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeRepo struct {
	trainers   []Peer
	eligible   map[string]bool
	users      map[string]bool
	blocked    bool
	grants     map[string]Grant
	audits     []AuditEntry
	records    []MemberRecord
	updated    map[string][]byte
	failWith   error
	auditFails bool
}

func newRepo() *fakeRepo {
	return &fakeRepo{
		eligible: map[string]bool{}, users: map[string]bool{},
		grants: map[string]Grant{}, updated: map[string][]byte{},
	}
}

func (f *fakeRepo) SearchTrainers(context.Context, string, string) ([]Peer, error) {
	return f.trainers, f.failWith
}
func (f *fakeRepo) TrainerEligible(_ context.Context, id string) (bool, error) {
	ok, known := f.eligible[id]
	if !known {
		return false, errs.New(errs.NotFound, "trainer not found")
	}
	return ok, nil
}
func (f *fakeRepo) UserExists(_ context.Context, id string) (bool, error) { return f.users[id], nil }
func (f *fakeRepo) Blocked(context.Context, string, string) (bool, error) { return f.blocked, nil }

func (f *fakeRepo) GetGrant(_ context.Context, id string) (Grant, error) {
	g, ok := f.grants[id]
	if !ok {
		return Grant{}, errs.New(errs.NotFound, "grant not found")
	}
	return g, nil
}
func (f *fakeRepo) GetGrantByPair(_ context.Context, trainerID, memberID string) (Grant, error) {
	for _, g := range f.grants {
		if g.TrainerID == trainerID && g.MemberID == memberID {
			return g, nil
		}
	}
	return Grant{}, errs.New(errs.NotFound, "grant not found")
}
func (f *fakeRepo) ListGrants(_ context.Context, viewerID string) ([]Grant, error) {
	var out []Grant
	for _, g := range f.grants {
		if g.TrainerID != viewerID && g.MemberID != viewerID {
			continue
		}
		view := g
		if g.TrainerID == viewerID {
			view.RoleOfMe, view.Peer = SideTrainer, Peer{ID: g.MemberID}
		} else {
			view.RoleOfMe, view.Peer = SideMember, Peer{ID: g.TrainerID}
		}
		out = append(out, view)
	}
	return out, nil
}
func (f *fakeRepo) CreateGrant(_ context.Context, id, trainerID, memberID, requestedBy string) (Grant, error) {
	g := Grant{
		ID: id, TrainerID: trainerID, MemberID: memberID, Status: StatusPending,
		RequestedBy: requestedBy, Scope: fullScope(),
	}
	f.grants[id] = g
	return g, nil
}
func (f *fakeRepo) ReopenGrant(_ context.Context, id, requestedBy string) (Grant, error) {
	g := f.grants[id]
	g.Status, g.RequestedBy, g.ConsentAt = StatusPending, requestedBy, time.Time{}
	f.grants[id] = g
	return g, nil
}
func (f *fakeRepo) AcceptGrant(_ context.Context, id string) (Grant, error) {
	g := f.grants[id]
	g.Status, g.ConsentAt = StatusActive, time.Unix(1, 0)
	f.grants[id] = g
	return g, nil
}
func (f *fakeRepo) RevokeGrant(_ context.Context, id string) (Grant, error) {
	g := f.grants[id]
	g.Status = StatusRevoked
	f.grants[id] = g
	return g, nil
}
func (f *fakeRepo) Audit(_ context.Context, id, grantID, actorID, action string, _ []byte) error {
	if f.auditFails {
		return errors.New("감사 기록 실패")
	}
	f.audits = append(f.audits, AuditEntry{ID: id, ActorID: actorID, Action: action})
	return nil
}
func (f *fakeRepo) ListAudit(context.Context, string) ([]AuditEntry, error) { return f.audits, nil }
func (f *fakeRepo) ListMemberRecords(context.Context, string, []string) ([]MemberRecord, error) {
	return f.records, f.failWith
}
func (f *fakeRepo) GetMemberRecord(_ context.Context, _, collection, recordID string) (string, []byte, error) {
	for _, r := range f.records {
		if r.Collection == collection && r.RecordID == recordID {
			return "row-" + recordID, r.Payload, nil
		}
	}
	return "", nil, errs.New(errs.NotFound, "routine exercise not found")
}
func (f *fakeRepo) UpdateMemberRecord(_ context.Context, rowID string, payload []byte) error {
	f.updated[rowID] = payload
	return nil
}

func fullScope() map[string]bool {
	return map[string]bool{ScopeRoutineEdit: true, ScopeScheduleEdit: true, ScopeLogView: true}
}

func newSvc(r *fakeRepo) *Service {
	n := 0
	return NewService(r, func() string { n++; return "id-" + string(rune('0'+n)) }, func() time.Time {
		return time.UnixMilli(1_700_000_000_000)
	})
}

func codeOf(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아니다: %v", err)
	}
	return de.Code
}

func rec(collection, id string, payload map[string]any) MemberRecord {
	b, _ := json.Marshal(payload)
	return MemberRecord{Collection: collection, RecordID: id, Payload: b}
}

// ── 관계 만들기 ──────────────────────────────────────────────────────────────

func TestRequest_한쪽만_지정해야_한다(t *testing.T) {
	repo := newRepo()
	svc := newSvc(repo)
	for name, args := range map[string][2]string{
		"둘 다 비었다": {"", ""},
		"둘 다 채웠다": {"t1", "m1"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := svc.Request(context.Background(), "u1", args[0], args[1])
			if codeOf(t, err) != errs.Validation {
				t.Fatalf("거절해야 한다: %v", err)
			}
		})
	}
}

func TestRequest_자기_자신은_못_가르친다(t *testing.T) {
	repo := newRepo()
	repo.eligible["u1"] = true
	_, err := newSvc(repo).Request(context.Background(), "u1", "u1", "")
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("거절해야 한다: %v", err)
	}
}

func TestRequest_코칭_의향이_없으면_걸_수_없다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = false // 계정은 있지만 코칭을 켜지 않았다
	repo.users["m1"] = true
	_, err := newSvc(repo).Request(context.Background(), "m1", "t1", "")
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("의향 없는 사람에게는 못 건다: %v", err)
	}
}

func TestRequest_차단한_사이에는_코칭도_없다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	repo.blocked = true
	_, err := newSvc(repo).Request(context.Background(), "m1", "t1", "")
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("차단 관계는 막아야 한다: %v", err)
	}
}

func TestRequest_해지된_관계는_같은_행을_되살린다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusRevoked,
		RequestedBy: SideMember, Scope: fullScope(),
	}

	g, err := newSvc(repo).Request(context.Background(), "t1", "", "m1")
	if err != nil {
		t.Fatal(err)
	}
	if g.ID != "g1" {
		t.Fatalf("새 행을 만들면 안 된다: %+v", g)
	}
	if len(repo.grants) != 1 {
		t.Fatalf("관계는 쌍당 하나다: %d개", len(repo.grants))
	}
	// 되살릴 때 **요청한 쪽이 바뀐다** — 이번엔 트레이너가 걸었다.
	if repo.grants["g1"].RequestedBy != SideTrainer {
		t.Fatalf("요청자가 갱신되지 않았다: %+v", repo.grants["g1"])
	}
}

func TestRequest_이미_있으면_거절한다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending}
	_, err := newSvc(repo).Request(context.Background(), "m1", "t1", "")
	if codeOf(t, err) != errs.Conflict {
		t.Fatalf("중복 요청은 거절해야 한다: %v", err)
	}
}

// ── 동의 ─────────────────────────────────────────────────────────────────────

func TestAccept_요청한_쪽은_수락할_수_없다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	// 트레이너가 회원을 지정해 걸었다. 트레이너가 스스로 수락하면 **회원 모르게 기록이 열린다**.
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending,
		RequestedBy: SideTrainer, Scope: fullScope(),
	}
	_, err := newSvc(repo).Accept(context.Background(), "t1", "g1")
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("요청자는 수락할 수 없어야 한다: %v", err)
	}
	if repo.grants["g1"].Status != StatusPending {
		t.Fatalf("상태가 바뀌면 안 된다")
	}
}

func TestAccept_반대편이_수락하면_열린다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending,
		RequestedBy: SideTrainer, Scope: fullScope(),
	}
	g, err := newSvc(repo).Accept(context.Background(), "m1", "g1")
	if err != nil {
		t.Fatal(err)
	}
	if g.Status != StatusActive || g.RoleOfMe != SideMember {
		t.Fatalf("회원 시점으로 열려야 한다: %+v", g)
	}
	if repo.grants["g1"].ConsentAt.IsZero() {
		t.Fatalf("동의 시각이 남아야 한다")
	}
}

func TestAccept_남의_관계는_건드릴_수_없다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending, RequestedBy: SideTrainer}
	_, err := newSvc(repo).Accept(context.Background(), "다른사람", "g1")
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("당사자가 아니면 막아야 한다: %v", err)
	}
}

func TestRevoke_양쪽_다_닫을_수_있다(t *testing.T) {
	for _, who := range []string{"t1", "m1"} {
		repo := newRepo()
		repo.grants["g1"] = Grant{
			ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive, Scope: fullScope(),
		}
		if _, err := newSvc(repo).Revoke(context.Background(), who, "g1"); err != nil {
			t.Fatalf("%s가 해지하지 못했다: %v", who, err)
		}
		if repo.grants["g1"].Status != StatusRevoked {
			t.Fatalf("%s: 해지되지 않았다", who)
		}
	}
}

// ── 회원 데이터 접근 ─────────────────────────────────────────────────────────

func activeGrant(repo *fakeRepo, scope map[string]bool) {
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive,
		RequestedBy: SideMember, Scope: scope,
	}
}

func TestReport_해지된_관계로는_못_본다(t *testing.T) {
	repo := newRepo()
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusRevoked, Scope: fullScope(),
	}
	_, err := newSvc(repo).GetMemberReport(context.Background(), "t1", "m1")
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("해지된 관계는 그 순간 닫혀야 한다: %v", err)
	}
}

func TestReport_범위_밖은_못_본다(t *testing.T) {
	repo := newRepo()
	// 루틴은 열었지만 기록 열람은 열지 않았다.
	activeGrant(repo, map[string]bool{ScopeRoutineEdit: true})
	_, err := newSvc(repo).GetMemberReport(context.Background(), "t1", "m1")
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("범위 밖은 막아야 한다: %v", err)
	}
}

func TestReport_깨진_범위는_아무것도_열지_않는다(t *testing.T) {
	repo := newRepo()
	// 저장소가 읽지 못한 범위(빈 map). "전부 허용"으로 읽으면 그 순간 무방비가 된다.
	activeGrant(repo, map[string]bool{})
	if _, err := newSvc(repo).GetMemberReport(context.Background(), "t1", "m1"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("빈 범위는 닫혀 있어야 한다: %v", err)
	}
}

func TestReport_관계가_없으면_못_본다(t *testing.T) {
	repo := newRepo()
	_, err := newSvc(repo).GetMemberReport(context.Background(), "t1", "m1")
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("관계 없이 남의 기록을 볼 수 없다: %v", err)
	}
}

func TestReport_본_것도_남는다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	if _, err := newSvc(repo).GetMemberReport(context.Background(), "t1", "m1"); err != nil {
		t.Fatal(err)
	}
	if len(repo.audits) != 1 || repo.audits[0].Action != ActionReportView {
		t.Fatalf("열람이 기록되지 않았다: %+v", repo.audits)
	}
}

func TestReport_사실만_센다(t *testing.T) {
	now := time.UnixMilli(1_700_000_000_000)
	old := now.Add(-20 * 7 * 24 * time.Hour).UnixMilli() // 8주보다 훨씬 전
	recent := now.Add(-3 * 24 * time.Hour).UnixMilli()

	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = []MemberRecord{
		// 기간 안, 완료 — 센다.
		rec("workouts", "w1", map[string]any{"id": "w1", "state": "completed", "started_at": recent, "total_volume_kg": 1000, "pr_count": 2, "name": "가슴"}),
		// 하는 중 — 아직 사실이 아니다.
		rec("workouts", "w2", map[string]any{"id": "w2", "state": "active", "started_at": recent, "total_volume_kg": 500}),
		// 기간 밖 — 8주 리포트에 넣지 않는다.
		rec("workouts", "w3", map[string]any{"id": "w3", "state": "completed", "started_at": old, "total_volume_kg": 9999}),

		rec("workout_exercises", "we1", map[string]any{"id": "we1", "workout_id": "w1", "exercise_id": "e1"}),
		rec("workout_exercises", "we3", map[string]any{"id": "we3", "workout_id": "w3", "exercise_id": "e1"}),
		rec("exercises", "e1", map[string]any{"id": "e1", "primary_muscles": `["chest","triceps"]`}),

		// 진짜 세트 — 60 × 10 = 600.
		rec("set_logs", "s1", map[string]any{"id": "s1", "workout_exercise_id": "we1", "weight_kg": 60, "reps": 10, "done": true}),
		// 워밍업 · 실패 · 미체크는 볼륨에서 뺀다.
		rec("set_logs", "s2", map[string]any{"id": "s2", "workout_exercise_id": "we1", "weight_kg": 20, "reps": 10, "done": true, "is_warmup": true}),
		rec("set_logs", "s3", map[string]any{"id": "s3", "workout_exercise_id": "we1", "weight_kg": 80, "reps": 5, "done": true, "is_failed": true}),
		rec("set_logs", "s4", map[string]any{"id": "s4", "workout_exercise_id": "we1", "weight_kg": 70, "reps": 8, "done": false}),
		// 기간 밖 세션의 세트 — 섞이면 안 된다.
		rec("set_logs", "s5", map[string]any{"id": "s5", "workout_exercise_id": "we3", "weight_kg": 100, "reps": 10, "done": true}),
	}

	r, err := newSvc(repo).GetMemberReport(context.Background(), "t1", "m1")
	if err != nil {
		t.Fatal(err)
	}
	if r.SessionsCount != 1 {
		t.Fatalf("끝난 세션만 세어야 한다: %d", r.SessionsCount)
	}
	if r.TotalVolumeKg != 1000 {
		t.Fatalf("총 볼륨은 세션이 기록한 값이다: %v", r.TotalVolumeKg)
	}
	if len(r.MuscleVolume) != 1 || r.MuscleVolume[0].Muscle != "chest" || r.MuscleVolume[0].VolumeKg != 600 {
		t.Fatalf("워밍업·실패·미체크·기간 밖이 섞였다: %+v", r.MuscleVolume)
	}
	if len(r.RecentSessions) != 1 || r.RecentSessions[0].Name != "가슴" {
		t.Fatalf("최근 세션이 틀렸다: %+v", r.RecentSessions)
	}
	if r.SessionsPerWeek != 0.1 {
		t.Fatalf("주당 세션이 틀렸다: %v", r.SessionsPerWeek)
	}
}

func TestRoutines_보관함과_빈_루틴은_빼고(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = []MemberRecord{
		rec("routines", "r1", map[string]any{"id": "r1", "name": "가슴날"}),
		rec("routines", "r2", map[string]any{"id": "r2", "name": "보관함", "is_archived": true}),
		rec("routines", "r3", map[string]any{"id": "r3", "name": "빈 루틴"}),
		rec("routine_exercises", "re2", map[string]any{"id": "re2", "routine_id": "r1", "exercise_id": "e1", "sort_order": 2, "target_sets": 3}),
		rec("routine_exercises", "re1", map[string]any{"id": "re1", "routine_id": "r1", "exercise_id": "e2", "sort_order": 1, "target_sets": 4,
			"prescription": `[{"setType":"top","targetRir":2,"repMin":5,"repMax":8,"loadHint":"heavy"}]`}),
		rec("exercises", "e1", map[string]any{"id": "e1", "name_ko": "벤치프레스"}),
		rec("exercises", "e2", map[string]any{"id": "e2", "name_ko": "스쿼트"}),
	}

	routines, err := newSvc(repo).ListMemberRoutines(context.Background(), "t1", "m1")
	if err != nil {
		t.Fatal(err)
	}
	if len(routines) != 1 || routines[0].ID != "r1" {
		t.Fatalf("보관함·빈 루틴은 빠져야 한다: %+v", routines)
	}
	// 순서는 회원이 정한 대로.
	if routines[0].Exercises[0].ExerciseName != "스쿼트" {
		t.Fatalf("정렬이 틀렸다: %+v", routines[0].Exercises)
	}
	rx := routines[0].Exercises[0].Prescription
	if len(rx) != 1 || rx[0].SetType != "top" || *rx[0].TargetRIR != 2 {
		t.Fatalf("처방을 읽지 못했다: %+v", rx)
	}
}

func TestPrescription_저장은_한_필드만_건드린다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = []MemberRecord{
		rec("routine_exercises", "re1", map[string]any{
			"id": "re1", "routine_id": "r1", "exercise_id": "e1",
			"target_sets": 3, "rest_seconds": 120, "note": "회원이 적은 메모",
		}),
	}

	two := 2
	five, eight := 5, 8
	_, err := newSvc(repo).SetMemberPrescription(context.Background(), "t1", "m1", "r1", "re1",
		[]PrescribedSet{
			{SetType: "top", TargetRIR: &two, RepMin: &five, RepMax: &eight, LoadHint: "heavy"},
			{SetType: "backoff"},
		})
	if err != nil {
		t.Fatal(err)
	}

	var saved map[string]any
	if err := json.Unmarshal(repo.updated["row-re1"], &saved); err != nil {
		t.Fatal(err)
	}
	// 회원이 적은 것은 그대로 남아야 한다.
	if saved["note"] != "회원이 적은 메모" || saved["rest_seconds"] != float64(120) {
		t.Fatalf("다른 필드가 바뀌었다: %+v", saved)
	}
	// 처방 줄 수가 곧 세트 수다.
	if saved["target_sets"] != float64(2) {
		t.Fatalf("세트 수가 처방과 어긋난다: %+v", saved["target_sets"])
	}
	// `@json` 컬럼은 **문자열**로 저장된다(WatermelonDB 규약).
	s, ok := saved["prescription"].(string)
	if !ok {
		t.Fatalf("처방이 문자열이 아니다: %T", saved["prescription"])
	}
	var rows []map[string]any
	if err := json.Unmarshal([]byte(s), &rows); err != nil || len(rows) != 2 {
		t.Fatalf("처방을 되읽지 못한다: %v %s", err, s)
	}
}

func TestPrescription_다른_루틴의_종목은_못_고친다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = []MemberRecord{
		rec("routine_exercises", "re1", map[string]any{"id": "re1", "routine_id": "다른루틴"}),
	}
	_, err := newSvc(repo).SetMemberPrescription(context.Background(), "t1", "m1", "r1", "re1", nil)
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("루틴이 어긋나면 거절해야 한다: %v", err)
	}
	if len(repo.updated) != 0 {
		t.Fatalf("고치면 안 된다")
	}
}

func TestPrescription_비우면_지운다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = []MemberRecord{
		rec("routine_exercises", "re1", map[string]any{
			"id": "re1", "routine_id": "r1", "target_sets": 4,
			"prescription": `[{"setType":"top"}]`,
		}),
	}
	rx, err := newSvc(repo).SetMemberPrescription(context.Background(), "t1", "m1", "r1", "re1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(rx) != 0 {
		t.Fatalf("비어야 한다: %+v", rx)
	}
	var saved map[string]any
	_ = json.Unmarshal(repo.updated["row-re1"], &saved)
	if saved["prescription"] != nil {
		t.Fatalf("처방이 지워지지 않았다: %+v", saved["prescription"])
	}
	// 세트 수는 회원이 정한 값 그대로 — 처방을 지웠다고 루틴 구성을 바꾸지 않는다.
	if saved["target_sets"] != float64(4) {
		t.Fatalf("세트 수를 건드렸다: %+v", saved["target_sets"])
	}
}

func TestPrescription_범위_밖이면_거절(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, map[string]bool{ScopeLogView: true}) // 기록만 열었다
	_, err := newSvc(repo).SetMemberPrescription(context.Background(), "t1", "m1", "r1", "re1", nil)
	if codeOf(t, err) != errs.Forbidden {
		t.Fatalf("루틴 편집 범위가 없으면 막아야 한다: %v", err)
	}
}

func TestAudit_당사자만_읽는다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.audits = []AuditEntry{{ID: "a1", ActorID: "t1", Action: ActionReportView}}

	// 회원도 읽을 수 있다 — 감시받는 쪽이 못 보면 신뢰 장치가 아니다.
	if _, err := newSvc(repo).ListAudit(context.Background(), "m1", "g1"); err != nil {
		t.Fatalf("회원이 이력을 읽지 못했다: %v", err)
	}
	if _, err := newSvc(repo).ListAudit(context.Background(), "남", "g1"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("당사자가 아니면 막아야 한다")
	}
}

func TestAudit_기록이_실패해도_동작은_되돌리지_않는다(t *testing.T) {
	repo := newRepo()
	repo.auditFails = true
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending,
		RequestedBy: SideTrainer, Scope: fullScope(),
	}
	// 이미 일어난 수락을 되돌리면 화면과 DB가 갈라진다.
	if _, err := newSvc(repo).Accept(context.Background(), "m1", "g1"); err != nil {
		t.Fatalf("감사 실패가 수락을 막으면 안 된다: %v", err)
	}
	if repo.grants["g1"].Status != StatusActive {
		t.Fatalf("수락이 반영되지 않았다")
	}
}

// ── 처방 정리 ────────────────────────────────────────────────────────────────

func TestSanitize_이상한_값은_거절이_아니라_정리(t *testing.T) {
	minus, huge := -3, 99
	rows := SanitizePrescription([]PrescribedSet{
		{SetType: "모르는타입", TargetRIR: &huge, LoadHint: "모르는힌트"},
		{SetType: "top", TargetRIR: &minus},
	})
	if len(rows) != 2 {
		t.Fatalf("줄을 버리면 세트 수가 어긋난다: %+v", rows)
	}
	if rows[0].SetType != "normal" || rows[0].LoadHint != "" {
		t.Fatalf("모르는 값은 기본으로 수렴해야 한다: %+v", rows[0])
	}
	if *rows[0].TargetRIR != rirMax || *rows[1].TargetRIR != rirMin {
		t.Fatalf("RIR을 0~6으로 잘라야 한다: %v %v", *rows[0].TargetRIR, *rows[1].TargetRIR)
	}
}

func TestSanitize_상한을_넘으면_자른다(t *testing.T) {
	rows := make([]PrescribedSet, maxPrescriptionRows+5)
	for i := range rows {
		rows[i] = PrescribedSet{SetType: "normal"}
	}
	if got := len(SanitizePrescription(rows)); got != maxPrescriptionRows {
		t.Fatalf("상한이 지켜지지 않았다: %d", got)
	}
}
