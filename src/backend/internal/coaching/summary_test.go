// @plm SRS-080  성과 요약·원본 레코드 테스트 — 받은 사람에게만, 한 번만, 허용한 만큼만 (ADR-040·041 · S-1~S-19)
package coaching

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/notification"
)

// ── 가짜 요약 저장소(fakeRepo 에 붙는다) ─────────────────────────────────────

func (f *fakeRepo) InsertProgressSummary(_ context.Context, s ProgressSummary) (ProgressSummary, bool, error) {
	if f.insertRace != nil {
		// 동시에 온 다른 요청이 같은 client_id 로 먼저 넣었다.
		f.summaries = append(f.summaries, *f.insertRace)
		f.insertRace = nil
	}
	for _, x := range f.summaries {
		if x.MemberID == s.MemberID && x.ClientID == s.ClientID {
			return ProgressSummary{}, false, nil
		}
	}
	s.CreatedAt = time.UnixMicro(1_700_000_000_000_000 + int64(len(f.summaries)))
	f.summaries = append(f.summaries, s)
	return s, true, nil
}

func (f *fakeRepo) GetProgressSummaryByMemberClient(_ context.Context, memberID, clientID string) (ProgressSummary, error) {
	for _, x := range f.summaries {
		if x.MemberID == memberID && x.ClientID == clientID {
			return x, nil
		}
	}
	return ProgressSummary{}, errs.New(errs.NotFound, "summary not found")
}

func (f *fakeRepo) GetProgressSummary(_ context.Context, id string) (ProgressSummary, error) {
	for _, x := range f.summaries {
		if x.ID == id {
			return x, nil
		}
	}
	return ProgressSummary{}, errs.New(errs.NotFound, "summary not found")
}

func (f *fakeRepo) SetProgressSummaryMessageID(_ context.Context, id, messageID string) (bool, error) {
	for i, x := range f.summaries {
		if x.ID == id && x.MessageID == "" {
			f.summaries[i].MessageID = messageID
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeRepo) ListSentSummaries(_ context.Context, memberID string, cursor *SummaryCursor, limit int) ([]SentSummary, error) {
	var rows []ProgressSummary
	for _, x := range f.summaries {
		if x.MemberID == memberID {
			rows = append(rows, x)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if !rows[i].CreatedAt.Equal(rows[j].CreatedAt) {
			return rows[i].CreatedAt.After(rows[j].CreatedAt)
		}
		return rows[i].ID > rows[j].ID
	})
	var out []SentSummary
	for _, x := range rows {
		if cursor != nil {
			before := x.CreatedAt.Before(cursor.CreatedAt) ||
				(x.CreatedAt.Equal(cursor.CreatedAt) && x.ID < cursor.ID)
			if !before {
				continue
			}
		}
		out = append(out, SentSummary{
			ID: x.ID, TrainerID: x.TrainerID, PeriodStart: x.PeriodStart, PeriodEnd: x.PeriodEnd,
			SchemaVersion: x.SchemaVersion, Delivered: x.MessageID != "", CreatedAt: x.CreatedAt,
		})
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) CountSummariesSince(_ context.Context, memberID string, since time.Time) (int, error) {
	n := 0
	for _, x := range f.summaries {
		if x.MemberID == memberID && !x.CreatedAt.Before(since) {
			n++
		}
	}
	return n, nil
}

// ── 가짜 DM·알림 ─────────────────────────────────────────────────────────────

// fakeMessenger는 dm.SendSummaryNotice 와 같은 계약이다: 메시지 id 가 요약에서 결정적이고, 이미 있으면 created=false.
type fakeMessenger struct {
	messages map[string]string // 메시지 id → 요약 id
	failNext int               // 남은 실패 횟수
	calls    int
	// 첫 호출 안에서 한 번 부른다 — "DM 전송 중에 같은 client_id 의 두 번째 요청이 끝까지 돈다"를 흉내.
	during func()
}

func newMessenger() *fakeMessenger { return &fakeMessenger{messages: map[string]string{}} }

func (m *fakeMessenger) SendSummaryNotice(_ context.Context, _, _, summaryID string) (string, bool, error) {
	m.calls++
	if m.failNext > 0 {
		m.failNext--
		return "", false, errors.New("DB 일시 오류")
	}
	if m.during != nil {
		f := m.during
		m.during = nil
		f()
	}
	id := "summary-" + summaryID
	if _, ok := m.messages[id]; ok {
		return id, false, nil
	}
	m.messages[id] = summaryID
	return id, true, nil
}

type notified struct{ userID, actorID, kind, postID string }

type fakeNotifier struct{ got []notified }

func (n *fakeNotifier) Notify(_ context.Context, userID, actorID, kind, postID string) {
	n.got = append(n.got, notified{userID, actorID, kind, postID})
}

// ── 공통 준비 ────────────────────────────────────────────────────────────────

var testNow = time.UnixMilli(1_700_000_000_000)

const day = 24 * time.Hour

func summarySvc(repo *fakeRepo) (*Service, *fakeMessenger, *fakeNotifier) {
	n := 0
	m, notif := newMessenger(), &fakeNotifier{}
	svc := NewService(repo, func() string {
		n++
		return fmt.Sprintf("00000000-0000-4000-8000-%012d", n)
	}, func() time.Time { return testNow }).WithSummaryDelivery(m, notif)
	return svc, m, notif
}

// 회원 m1 → 트레이너 t1 active(동의 시각 consent).
func coachPair(repo *fakeRepo, id, trainer string, consent time.Time) {
	repo.grants[id] = Grant{
		ID: id, TrainerID: trainer, MemberID: "m1", Status: StatusActive,
		RequestedBy: SideMember, Scope: fullScope(), ConsentAt: consent,
	}
}

func snapshot(extra string) string {
	return `{"schemaVersion":1,"range":{"startMs":1,"endMs":2,"tz":"Asia/Seoul"},"counts":{"workouts":3}` + extra + `}`
}

func sendInput(clientID string) SendSummaryInput {
	return SendSummaryInput{
		TrainerID: "t1", PeriodStartMs: testNow.Add(-28 * day).UnixMilli(), PeriodEndMs: testNow.UnixMilli(),
		SchemaVersion: 1, SnapshotJSON: snapshot(""), ClientID: clientID,
	}
}

const cid1 = "11111111-1111-4111-8111-111111111111"
const cid2 = "22222222-2222-4222-8222-222222222222"

func actions(repo *fakeRepo) []string {
	var out []string
	for _, a := range repo.audits {
		out = append(out, a.Action)
	}
	return out
}

// ── 보내기 ───────────────────────────────────────────────────────────────────

func TestSendSummary_저장_DM_알림_감사가_한_번씩(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, m, notif := summarySvc(repo)

	id, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1))
	if err != nil {
		t.Fatal(err)
	}
	if len(repo.summaries) != 1 || repo.summaries[0].ID != id {
		t.Fatalf("한 행이 저장돼야 한다: %+v", repo.summaries)
	}
	s := repo.summaries[0]
	if s.MessageID != "summary-"+id || !s.GrantConsentAt.Equal(time.Unix(10, 0)) {
		t.Fatalf("메시지 id·동의 시각이 기록돼야 한다: %+v", s)
	}
	if len(m.messages) != 1 {
		t.Fatalf("DM 1건: %v", m.messages)
	}
	want := notified{"t1", "m1", string(notification.KindCoachingSummary), ""}
	if len(notif.got) != 1 || notif.got[0] != want {
		t.Fatalf("알림은 트레이너에게 · post_id 없이 · coaching_summary: %+v", notif.got)
	}
	if !slices.Equal(actions(repo), []string{ActionSummarySend}) || repo.audits[0].ActorID != "m1" {
		t.Fatalf("감사 summary_send 한 번: %+v", repo.audits)
	}

	// 같은 client_id 재전송 — 같은 id, 아무것도 늘지 않는다.
	again, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1))
	if err != nil || again != id {
		t.Fatalf("재전송은 같은 id: %s %v", again, err)
	}
	if len(repo.summaries) != 1 || len(m.messages) != 1 || len(notif.got) != 1 || len(repo.audits) != 1 {
		t.Fatalf("재전송이 아무것도 늘리면 안 된다: rows=%d dm=%d notif=%d audit=%d",
			len(repo.summaries), len(m.messages), len(notif.got), len(repo.audits))
	}
}

func TestSendSummary_DM_이_한_번_실패해도_재시도하면_한_건(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, m, notif := summarySvc(repo)
	m.failNext = 1

	if _, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1)); err == nil {
		t.Fatal("DM 실패는 오류로 돌아가야 한다(기기가 다시 보낸다)")
	}
	if len(repo.summaries) != 1 || repo.summaries[0].MessageID != "" {
		t.Fatalf("행은 남되 아직 전달 전이어야 한다: %+v", repo.summaries)
	}
	if len(notif.got) != 0 || len(repo.audits) != 0 {
		t.Fatal("전달 전에는 알림·감사가 없다")
	}

	id, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1))
	if err != nil {
		t.Fatal(err)
	}
	if len(m.messages) != 1 || repo.summaries[0].MessageID != "summary-"+id {
		t.Fatalf("재시도로 메시지 1건: %v", m.messages)
	}
	if len(notif.got) != 1 || len(repo.audits) != 1 {
		t.Fatalf("알림·감사 한 번: %d %d", len(notif.got), len(repo.audits))
	}
}

func TestSendSummary_동시_두_요청이어도_메시지_한_건(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, m, notif := summarySvc(repo)

	// 첫 요청이 DM 을 보내는 사이에 두 번째 요청이 끝까지 돈다(행은 있고 message_id 는 아직 NULL).
	var secondID string
	var secondErr error
	m.during = func() {
		secondID, secondErr = svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1))
	}
	firstID, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1))
	if err != nil || secondErr != nil {
		t.Fatal(err, secondErr)
	}
	if firstID != secondID {
		t.Fatalf("같은 요약이어야 한다: %s %s", firstID, secondID)
	}
	if m.calls != 2 || len(m.messages) != 1 {
		t.Fatalf("DM 은 두 번 불려도 메시지는 1건: calls=%d messages=%d", m.calls, len(m.messages))
	}
	if len(notif.got) != 1 || len(repo.audits) != 1 {
		t.Fatalf("알림·감사는 기록한 쪽 한 번만: %d %d", len(notif.got), len(repo.audits))
	}
}

func TestSendSummary_Insert_충돌이면_먼저_들어간_행을_쓴다(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, m, _ := summarySvc(repo)
	in := sendInput(cid1)
	repo.insertRace = &ProgressSummary{
		ID: "99999999-9999-4999-8999-999999999999", MemberID: "m1", TrainerID: "t1",
		GrantConsentAt: time.Unix(10, 0), PeriodStart: time.UnixMilli(in.PeriodStartMs),
		PeriodEnd: time.UnixMilli(in.PeriodEndMs), SchemaVersion: 1,
		// 키 순서·공백이 달라도 같은 내용(jsonb 가 바꿔 저장한 모양).
		Snapshot: []byte(`{"counts": {"workouts": 3}, "range": {"tz": "Asia/Seoul", "endMs": 2, "startMs": 1}, "schemaVersion": 1}`),
		ClientID: cid1,
	}
	id, err := svc.SendProgressSummary(context.Background(), "m1", in)
	if err != nil {
		t.Fatal(err)
	}
	if id != "99999999-9999-4999-8999-999999999999" || len(repo.summaries) != 1 || len(m.messages) != 1 {
		t.Fatalf("먼저 들어간 행 하나로 끝나야 한다: id=%s rows=%d", id, len(repo.summaries))
	}
}

func TestSendSummary_같은_client_id_다른_내용은_Conflict(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	coachPair(repo, "g2", "t2", time.Unix(11, 0))
	svc, _, _ := summarySvc(repo)
	if _, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1)); err != nil {
		t.Fatal(err)
	}
	other := sendInput(cid1)
	other.SnapshotJSON = snapshot(`,"prCount":2`)
	otherTrainer := sendInput(cid1)
	otherTrainer.TrainerID = "t2"
	otherPeriod := sendInput(cid1)
	otherPeriod.PeriodStartMs -= 1000
	for name, in := range map[string]SendSummaryInput{"스냅샷": other, "트레이너": otherTrainer, "기간": otherPeriod} {
		if _, err := svc.SendProgressSummary(context.Background(), "m1", in); codeOf(t, err) != errs.Conflict {
			t.Fatalf("%s 가 다르면 Conflict: %v", name, err)
		}
	}
}

func TestSendSummary_가드와_차단은_저장_전에(t *testing.T) {
	cases := map[string]func(repo *fakeRepo){
		"관계 없음": func(*fakeRepo) {},
		"해지":    func(r *fakeRepo) { g := r.grants["g1"]; g.Status = StatusRevoked; r.grants["g1"] = g },
		"logView 끔": func(r *fakeRepo) {
			g := r.grants["g1"]
			g.Scope = map[string]bool{ScopeRoutineEdit: true}
			r.grants["g1"] = g
		},
		"차단": func(r *fakeRepo) { r.blocked = true },
	}
	for name, setup := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newRepo()
			if name != "관계 없음" {
				coachPair(repo, "g1", "t1", time.Unix(10, 0))
			}
			setup(repo)
			svc, m, _ := summarySvc(repo)
			_, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1))
			if codeOf(t, err) != errs.Forbidden {
				t.Fatalf("Forbidden 이어야 한다: %v", err)
			}
			if len(repo.summaries) != 0 || m.calls != 0 {
				t.Fatal("거부면 저장·DM 이 없어야 한다(고아 행 금지)")
			}
		})
	}
}

func TestSendSummary_입력_검사(t *testing.T) {
	big := snapshot(`,"pad":"` + strings.Repeat("x", maxSnapshotBytes) + `"`)
	cases := map[string]func(in *SendSummaryInput){
		"크기 초과":            func(in *SendSummaryInput) { in.SnapshotJSON = big },
		"NUL":              func(in *SendSummaryInput) { in.SnapshotJSON = snapshot(`,"name":"a\u0000b"`) },
		"키에 NUL":           func(in *SendSummaryInput) { in.SnapshotJSON = snapshot(`,"a\u0000":1`) },
		"깨진 JSON":          func(in *SendSummaryInput) { in.SnapshotJSON = `{"schemaVersion":1` },
		"객체 아님":            func(in *SendSummaryInput) { in.SnapshotJSON = `[1,2]` },
		"schemaVersion 다름": func(in *SendSummaryInput) { in.SnapshotJSON = `{"schemaVersion":2}` },
		"schemaVersion 없음": func(in *SendSummaryInput) { in.SnapshotJSON = `{"counts":{}}` },
		"지원 안 하는 판": func(in *SendSummaryInput) {
			in.SchemaVersion = 2
			in.SnapshotJSON = `{"schemaVersion":2}`
		},
		"기간 거꾸로":     func(in *SendSummaryInput) { in.PeriodStartMs, in.PeriodEndMs = in.PeriodEndMs, in.PeriodStartMs },
		"기간 400일 초과": func(in *SendSummaryInput) { in.PeriodStartMs = testNow.Add(-401 * day).UnixMilli() },
		"끝이 미래":      func(in *SendSummaryInput) { in.PeriodEndMs = testNow.Add(2 * day).UnixMilli() },
		"client_id":  func(in *SendSummaryInput) { in.ClientID = "abc" },
		"자기 자신":      func(in *SendSummaryInput) { in.TrainerID = "m1" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newRepo()
			coachPair(repo, "g1", "t1", time.Unix(10, 0))
			svc, _, _ := summarySvc(repo)
			in := sendInput(cid1)
			mutate(&in)
			if _, err := svc.SendProgressSummary(context.Background(), "m1", in); codeOf(t, err) != errs.Validation {
				t.Fatalf("Validation 이어야 한다: %v", err)
			}
			if len(repo.summaries) != 0 {
				t.Fatal("저장되면 안 된다")
			}
		})
	}
	// 이스케이프된 백슬래시 뒤의 글자 u0000 은 NUL 이 아니다 — 거부하지 않는다.
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, _, _ := summarySvc(repo)
	in := sendInput(cid1)
	in.SnapshotJSON = snapshot(`,"name":"a\\u0000b"`)
	if _, err := svc.SendProgressSummary(context.Background(), "m1", in); err != nil {
		t.Fatalf("글자 그대로의 \\u0000 은 받아야 한다: %v", err)
	}
}

func TestSendSummary_하루_20건_상한(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, _, _ := summarySvc(repo)
	for i := 0; i < maxSummariesPerDay; i++ {
		repo.summaries = append(repo.summaries, ProgressSummary{
			ID: fmt.Sprintf("old-%d", i), MemberID: "m1", TrainerID: "t1", ClientID: fmt.Sprintf("c-%d", i),
			MessageID: "x", CreatedAt: testNow.Add(-time.Hour),
		})
	}
	if _, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1)); codeOf(t, err) != errs.ResourceExhausted {
		t.Fatalf("21번째는 ResourceExhausted: %v", err)
	}
	// 하루가 지난 것은 세지 않는다.
	for i := range repo.summaries {
		repo.summaries[i].CreatedAt = testNow.Add(-25 * time.Hour)
	}
	if _, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(cid1)); err != nil {
		t.Fatalf("하루 지난 것은 세지 않는다: %v", err)
	}
}

// ── 열기 ─────────────────────────────────────────────────────────────────────

func sentSummary(t *testing.T, repo *fakeRepo, svc *Service, clientID string) string {
	t.Helper()
	id, err := svc.SendProgressSummary(context.Background(), "m1", sendInput(clientID))
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestGetSummary_회원과_받은_트레이너만(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	coachPair(repo, "g2", "t2", time.Unix(11, 0)) // 같은 회원의 다른 active 트레이너
	svc, _, _ := summarySvc(repo)
	id := sentSummary(t, repo, svc, cid1)
	repo.audits = nil

	// 회원 본인 — 열리고 감사는 남지 않는다(자기 기록).
	if s, err := svc.GetProgressSummary(context.Background(), "m1", id); err != nil || s.ID != id {
		t.Fatalf("회원은 열 수 있다: %v", err)
	}
	if len(repo.audits) != 0 {
		t.Fatalf("회원 열람은 감사가 아니다: %+v", repo.audits)
	}
	// 받은 트레이너 — 열리고 summary_view.
	s, err := svc.GetProgressSummary(context.Background(), "t1", id)
	if err != nil || string(s.Snapshot) != snapshot("") {
		t.Fatalf("받은 트레이너는 연다: %v", err)
	}
	if !slices.Equal(actions(repo), []string{ActionSummaryView}) || repo.audits[0].ActorID != "t1" {
		t.Fatalf("트레이너 열람은 summary_view: %+v", repo.audits)
	}
	// 같은 회원의 다른 active 트레이너 — 당사자가 아니라 NotFound(S-1·S-17).
	if _, err := svc.GetProgressSummary(context.Background(), "t2", id); codeOf(t, err) != errs.NotFound {
		t.Fatalf("다른 트레이너는 NotFound: %v", err)
	}
	// 남 — NotFound. 없는 id 도 NotFound(구분할 수 없어야 한다).
	if _, err := svc.GetProgressSummary(context.Background(), "x", id); codeOf(t, err) != errs.NotFound {
		t.Fatalf("남은 NotFound: %v", err)
	}
	if _, err := svc.GetProgressSummary(context.Background(), "t1", "nope"); codeOf(t, err) != errs.NotFound {
		t.Fatalf("없는 id 는 NotFound: %v", err)
	}
}

func TestGetSummary_scope_끄면_거부(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, _, _ := summarySvc(repo)
	id := sentSummary(t, repo, svc, cid1)
	g := repo.grants["g1"]
	g.Scope = map[string]bool{ScopeRoutineEdit: true, ScopeScheduleEdit: true}
	repo.grants["g1"] = g
	if _, err := svc.GetProgressSummary(context.Background(), "t1", id); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("logView 를 끄면 Forbidden: %v", err)
	}
}

func TestGetSummary_해지하면_거부_재계약하면_옛_것은_거부_새_것은_허용(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	ctx := context.Background()
	svc, _, _ := summarySvc(repo)

	// 실제 흐름으로 맺는다: 회원 요청 → 트레이너 수락(동의 시각 #1).
	g, err := svc.Request(ctx, "m1", "t1", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, "t1", g.ID); err != nil {
		t.Fatal(err)
	}
	old := sentSummary(t, repo, svc, cid1)

	// 해지 → 당사자라 PermissionDenied(Forbidden).
	if _, err := svc.Revoke(ctx, "m1", g.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProgressSummary(ctx, "t1", old); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("해지 뒤에는 Forbidden: %v", err)
	}

	// 다시 요청·수락 — 같은 행이 되살아나지만 동의 시각이 바뀐다(#2).
	if _, err := svc.Request(ctx, "m1", "t1", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, "t1", g.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProgressSummary(ctx, "t1", old); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("예전 관계 때 보낸 요약은 다시 열리지 않는다: %v", err)
	}
	fresh := sentSummary(t, repo, svc, cid2)
	if _, err := svc.GetProgressSummary(ctx, "t1", fresh); err != nil {
		t.Fatalf("새 관계에서 보낸 요약은 열린다: %v", err)
	}
	// 회원은 옛 것도 언제나 연다.
	if _, err := svc.GetProgressSummary(ctx, "m1", old); err != nil {
		t.Fatalf("회원은 자기 요약을 연다: %v", err)
	}
}

func TestListSentSummaries_50개씩_커서(t *testing.T) {
	repo := newRepo()
	svc, _, _ := summarySvc(repo)
	for i := 0; i < 53; i++ {
		repo.summaries = append(repo.summaries, ProgressSummary{
			ID: fmt.Sprintf("s-%02d", i), MemberID: "m1", TrainerID: "t1", ClientID: fmt.Sprintf("c-%d", i),
			CreatedAt: time.UnixMicro(1_700_000_000_000_000 + int64(i)),
		})
	}
	repo.summaries = append(repo.summaries, ProgressSummary{ID: "other", MemberID: "m2", CreatedAt: testNow})

	page1, next, err := svc.ListSentSummaries(context.Background(), "m1", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(page1) != 50 || next == "" || page1[0].ID != "s-52" {
		t.Fatalf("첫 페이지 50개·최신 먼저·커서 있음: n=%d next=%q first=%s", len(page1), next, page1[0].ID)
	}
	page2, next2, err := svc.ListSentSummaries(context.Background(), "m1", next)
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) != 3 || next2 != "" || page2[0].ID != "s-02" {
		t.Fatalf("나머지 3개·끝: n=%d next=%q", len(page2), next2)
	}
	if _, _, err := svc.ListSentSummaries(context.Background(), "m1", "garbage"); codeOf(t, err) != errs.Validation {
		t.Fatalf("깨진 커서는 Validation: %v", err)
	}
}

// ── 원본 레코드 ──────────────────────────────────────────────────────────────

func recordsFixture() []MemberRecord {
	in := testNow.Add(-3 * day).UnixMilli()      // 요청 기간 안
	prev := testNow.Add(-40 * day).UnixMilli()   // 직전 기간(28일 요청이면 [−56일, −28일))
	tooOld := testNow.Add(-90 * day).UnixMilli() // 내주는 기간 밖
	return []MemberRecord{
		rec("workouts", "w1", map[string]any{
			"id": "w1", "state": "completed", "started_at": in, "total_volume_kg": 1000, "pr_count": 1,
			"notes": "어깨가 아팠다", "name": "가슴 날", "user_id": "m1", "accumulated_pause_ms": 0,
		}),
		rec("workouts", "w2", map[string]any{"id": "w2", "state": "completed", "started_at": prev, "total_volume_kg": 500}),
		rec("workouts", "w3", map[string]any{"id": "w3", "state": "in_progress", "started_at": in}),
		rec("workouts", "w4", map[string]any{"id": "w4", "state": "completed", "started_at": tooOld}),
		rec("workout_exercises", "we1", map[string]any{
			"id": "we1", "workout_id": "w1", "exercise_id": "cx1", "sort_order": 0, "weight_unit": "kg",
			"variant_grip": "wide", "note": "메모", "prev_weight_kg": 60, "prescription": "[]",
		}),
		rec("workout_exercises", "we2", map[string]any{"id": "we2", "workout_id": "w2", "exercise_id": "seed-bench"}),
		rec("workout_exercises", "we3", map[string]any{"id": "we3", "workout_id": "w3", "exercise_id": "cx2"}),
		rec("workout_exercises", "we4", map[string]any{"id": "we4", "workout_id": "w4", "exercise_id": "cx3"}),
		rec("set_logs", "s1", map[string]any{
			"id": "s1", "workout_exercise_id": "we1", "set_number": 1, "weight_kg": 60, "reps": 10, "rir": 2,
			"done": true, "is_warmup": false, "user_edited": true, "completed_at": in, "arm": "uni",
		}),
		rec("set_logs", "s2", map[string]any{"id": "s2", "workout_exercise_id": "we2", "weight_kg": 50, "reps": 5}),
		rec("set_logs", "s3", map[string]any{"id": "s3", "workout_exercise_id": "we3", "weight_kg": 70, "reps": 3}),
		rec("set_logs", "s4", map[string]any{"id": "s4", "workout_exercise_id": "we4", "weight_kg": 80, "reps": 1}),
		rec("exercises", "cx1", map[string]any{
			"id": "cx1", "name_ko": "내 프레스", "primary_muscles": `["chest"]`, "is_custom": true,
			"image_url": "/media/file/abc", "aliases": `["x"]`,
		}),
		rec("exercises", "cx2", map[string]any{"id": "cx2", "name_ko": "진행 중 종목", "is_custom": true}),
		rec("exercises", "cx9", map[string]any{"id": "cx9", "name_ko": "안 쓴 종목", "is_custom": true}),
		rec("exercises", "seed-bench", map[string]any{"id": "seed-bench", "name_ko": "벤치", "is_custom": false}),
		// 저장소가 엉뚱한 컬렉션을 돌려줘도 나가면 안 된다.
		rec("bodyweight_logs", "bw1", map[string]any{"id": "bw1", "weight_kg": 80, "measured_at": in}),
		rec("user_profiles", "p1", map[string]any{"id": "p1", "bodyweight_kg": 80, "email": "a@b.c"}),
		rec("import_batches", "ib1", map[string]any{"id": "ib1", "file_label": "strong.csv"}),
	}
}

func decodeAll(t *testing.T, list []string) []map[string]any {
	t.Helper()
	out := make([]map[string]any, 0, len(list))
	for _, s := range list {
		var m map[string]any
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			t.Fatalf("JSON 객체여야 한다: %s", s)
		}
		out = append(out, m)
	}
	return out
}

func ids(rows []map[string]any) []string {
	var out []string
	for _, r := range rows {
		out = append(out, r["id"].(string))
	}
	return out
}

func TestMemberRecords_완료_운동과_자식_쓰인_커스텀_종목만_직전_기간까지(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = recordsFixture()
	svc, _, _ := summarySvc(repo)

	start, end := testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli()
	r, err := svc.GetMemberRecords(context.Background(), "t1", "m1", start, end)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(repo.listedFor, memberRecordCollections) {
		t.Fatalf("허용 컬렉션만 읽는다: %v", repo.listedFor)
	}
	if got := ids(decodeAll(t, r.Workouts)); !slices.Equal(got, []string{"w1", "w2"}) {
		t.Fatalf("완료 + [start−len, end) 만: %v", got)
	}
	if got := ids(decodeAll(t, r.WorkoutExercises)); !slices.Equal(got, []string{"we1", "we2"}) {
		t.Fatalf("그 운동의 블록만: %v", got)
	}
	if got := ids(decodeAll(t, r.SetLogs)); !slices.Equal(got, []string{"s1", "s2"}) {
		t.Fatalf("그 블록의 세트만: %v", got)
	}
	if got := ids(decodeAll(t, r.Exercises)); !slices.Equal(got, []string{"cx1"}) {
		t.Fatalf("쓰인 커스텀 종목만(시드·안 쓴·진행 중 운동 종목 제외): %v", got)
	}
	if r.ServedStart.UnixMilli() != testNow.Add(-56*day).UnixMilli() || r.ServedEnd.UnixMilli() != end {
		t.Fatalf("내준 기간 = [start−len, end): %v %v", r.ServedStart, r.ServedEnd)
	}
	// 감사 records_view — detail 에 실제 기간·행 수.
	if !slices.Equal(actions(repo), []string{ActionRecordsView}) {
		t.Fatalf("records_view 감사: %+v", repo.audits)
	}
	var detail map[string]float64
	if err := json.Unmarshal(repo.auditDetails[0], &detail); err != nil {
		t.Fatal(err)
	}
	if detail["servedStart"] != float64(r.ServedStart.UnixMilli()) || detail["workouts"] != 2 || detail["setLogs"] != 2 ||
		detail["workoutExercises"] != 2 || detail["exercises"] != 1 || detail["servedEnd"] != float64(end) {
		t.Fatalf("감사 detail(camelCase 키): %s", repo.auditDetails[0])
	}
}

func TestMemberRecords_허용_밖_칸은_응답에_없다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	repo.records = recordsFixture()
	svc, _, _ := summarySvc(repo)
	r, err := svc.GetMemberRecords(context.Background(), "t1", "m1",
		testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	check := func(collection string, list []string) {
		allowed := map[string]bool{}
		for _, f := range memberRecordFields[collection] {
			allowed[f] = true
		}
		for _, row := range decodeAll(t, list) {
			for k := range row {
				if !allowed[k] {
					t.Errorf("%s 에 허용 밖 칸 %q 가 나갔다: %v", collection, k, row)
				}
			}
		}
	}
	check("workouts", r.Workouts)
	check("workout_exercises", r.WorkoutExercises)
	check("set_logs", r.SetLogs)
	check("exercises", r.Exercises)

	// 이름으로도 한 번 더 — 자유 글·주소·처방·이전 스냅샷·신체정보가 문자열 어디에도 없다.
	all := strings.Join(append(append(append(r.Workouts, r.WorkoutExercises...), r.SetLogs...), r.Exercises...), "\n")
	for _, banned := range []string{"notes", `"note"`, "image_url", "prescription", "prev_", "어깨가 아팠다", "메모",
		"/media/file", "bodyweight", "email", "file_label", "user_id", "user_edited", "aliases", "is_custom"} {
		if strings.Contains(all, banned) {
			t.Errorf("응답에 %q 가 있다", banned)
		}
	}
	// 허용 칸은 그대로(값 손대지 않음).
	w := decodeAll(t, r.Workouts)[0]
	if w["total_volume_kg"] != float64(1000) || w["pr_count"] != float64(1) || w["state"] != "completed" {
		t.Fatalf("허용 칸 값은 그대로: %v", w)
	}
	s := decodeAll(t, r.SetLogs)[0]
	if s["rir"] != float64(2) || s["done"] != true {
		t.Fatalf("세트 rir·done 은 나간다: %v", s)
	}
}

func TestMemberRecords_가드_기간_크기(t *testing.T) {
	start, end := testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli()

	t.Run("scope 끔", func(t *testing.T) {
		repo := newRepo()
		activeGrant(repo, map[string]bool{ScopeRoutineEdit: true})
		svc, _, _ := summarySvc(repo)
		if _, err := svc.GetMemberRecords(context.Background(), "t1", "m1", start, end); codeOf(t, err) != errs.Forbidden {
			t.Fatalf("Forbidden: %v", err)
		}
		if len(repo.audits) != 0 {
			t.Fatal("거부면 감사도 없다")
		}
	})
	t.Run("해지", func(t *testing.T) {
		repo := newRepo()
		repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusRevoked, Scope: fullScope()}
		svc, _, _ := summarySvc(repo)
		if _, err := svc.GetMemberRecords(context.Background(), "t1", "m1", start, end); codeOf(t, err) != errs.Forbidden {
			t.Fatalf("Forbidden: %v", err)
		}
	})
	for name, p := range map[string][2]int64{
		"400일 초과": {testNow.Add(-401 * day).UnixMilli(), end},
		"거꾸로":     {end, start},
		"끝이 미래":   {start, testNow.Add(3 * day).UnixMilli()},
		"0부터":     {0, end},
	} {
		t.Run(name, func(t *testing.T) {
			repo := newRepo()
			activeGrant(repo, fullScope())
			svc, _, _ := summarySvc(repo)
			if _, err := svc.GetMemberRecords(context.Background(), "t1", "m1", p[0], p[1]); codeOf(t, err) != errs.Validation {
				t.Fatalf("Validation: %v", err)
			}
		})
	}
	t.Run("2MB 초과", func(t *testing.T) {
		repo := newRepo()
		activeGrant(repo, fullScope())
		repo.records = []MemberRecord{rec("workouts", "w1", map[string]any{
			"id": "w1", "state": "completed", "started_at": testNow.Add(-day).UnixMilli(),
		})}
		repo.records = append(repo.records, rec("workout_exercises", "we1", map[string]any{"id": "we1", "workout_id": "w1"}))
		for i := 0; i < 30_000; i++ {
			id := fmt.Sprintf("s%05d", i)
			repo.records = append(repo.records, rec("set_logs", id, map[string]any{
				"id": id, "workout_exercise_id": "we1", "set_number": i, "weight_kg": 100.25, "reps": 10,
				"is_warmup": false, "is_failed": false, "done": true, "set_type": "normal",
			}))
		}
		svc, _, _ := summarySvc(repo)
		if _, err := svc.GetMemberRecords(context.Background(), "t1", "m1", start, end); codeOf(t, err) != errs.ResourceExhausted {
			t.Fatalf("ResourceExhausted: %v", err)
		}
		if len(repo.audits) != 0 {
			t.Fatal("내주지 않았으면 감사도 없다")
		}
	})
}

// ── 컬렉션 상수(D-17 · S-2) ─────────────────────────────────────────────────

// 신체정보(user_profiles·bodyweight_logs)와 가져오기 살림(import_batches·import_aliases)은
// 어떤 코칭 경로로도 나가지 않는다 — 옛 리포트·루틴·새 원본 레코드 모두.
func TestCollections_신체정보와_가져오기_표는_코칭에_없다(t *testing.T) {
	banned := []string{"user_profiles", "bodyweight_logs", "import_batches", "import_aliases"}
	for name, list := range map[string][]string{
		"reportCollections":       reportCollections,
		"routineCollections":      routineCollections,
		"memberRecordCollections": memberRecordCollections,
	} {
		for _, b := range banned {
			if slices.Contains(list, b) {
				t.Errorf("%s 에 %s 가 들어 있다", name, b)
			}
		}
	}
	for c := range memberRecordFields {
		if slices.Contains(banned, c) {
			t.Errorf("memberRecordFields 에 %s", c)
		}
	}
	// 허용 목록은 읽는 컬렉션과 칸 목록이 정확히 같은 집합이다(한쪽만 늘면 테스트가 깨진다).
	keys := make([]string, 0, len(memberRecordFields))
	for c := range memberRecordFields {
		keys = append(keys, c)
	}
	sort.Strings(keys)
	want := slices.Clone(memberRecordCollections)
	sort.Strings(want)
	if !slices.Equal(keys, want) {
		t.Fatalf("컬렉션·칸 목록이 어긋났다: %v vs %v", keys, want)
	}
	// 자유 글·주소·처방·이전 스냅샷 칸은 허용 목록에 없다.
	for c, fields := range memberRecordFields {
		for _, f := range fields {
			if f == "notes" || f == "note" || f == "image_url" || f == "prescription" || strings.HasPrefix(f, "prev_") ||
				f == "user_id" || f == "name" {
				t.Errorf("%s.%s 는 허용 목록에 있으면 안 된다", c, f)
			}
		}
	}
}

func TestNotifyKind_알림_패키지와_같은_이름(t *testing.T) {
	if notifyKindCoachingSummary != string(notification.KindCoachingSummary) {
		t.Fatalf("알림 종류 이름이 어긋났다: %q vs %q", notifyKindCoachingSummary, notification.KindCoachingSummary)
	}
}

func TestSummaryCursor_마이크로초_왕복(t *testing.T) {
	c := SummaryCursor{CreatedAt: time.UnixMicro(1_700_000_000_123_456), ID: "abc"}
	got, err := parseSummaryCursor(formatSummaryCursor(c))
	if err != nil || !got.CreatedAt.Equal(c.CreatedAt) || got.ID != "abc" {
		t.Fatalf("왕복: %+v %v", got, err)
	}
}
