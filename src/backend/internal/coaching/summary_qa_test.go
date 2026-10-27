// @plm SRS-080  /qa code R1 보안 조치 회귀 — 큰 숫자·서로게이트·차단 회수·읽기 예산·재계약 재전송·감사 합치기 (CS-1~CS-7)
package coaching

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// CS-1 · CS-2 — jsonb 가 펼치는 숫자와 PG 가 거부하는 서로게이트는 저장 전에 Validation.
func TestSendSummary_큰_숫자와_짝_없는_서로게이트는_Validation(t *testing.T) {
	cases := map[string]string{
		"1e130000":             snapshot(`,"x":1e130000`),
		"7천 개의 1e130000(64KB)": snapshot(`,"x":[` + strings.TrimSuffix(strings.Repeat("1e130000,", 7000), ",") + `]`),
		"1e400(float64 넘음)":    snapshot(`,"x":1e400`),
		"1e20(|값| > 1e15)":     snapshot(`,"x":1e20`),
		"0e-99999(값은 0)":       snapshot(`,"x":0e-99999`),
		"긴 숫자 글자":              snapshot(`,"x":1` + strings.Repeat("0", 40)),
		"중첩 깊은 곳":              snapshot(`,"a":{"b":[{"c":-1e31}]}`),
		"짝 없는 높은 서로게이트":        snapshot(`,"x":"\ud800"`),
		"짝 없는 낮은 서로게이트":        snapshot(`,"x":"\udc00"`),
		"키의 서로게이트":             snapshot(`,"\ud800":1`),
	}
	for name, snap := range cases {
		t.Run(name, func(t *testing.T) {
			repo := newRepo()
			coachPair(repo, "g1", "t1", time.Unix(10, 0))
			svc, m, _ := summarySvc(repo)
			in := sendInput(cid1)
			in.SnapshotJSON = snap
			if _, err := svc.SendProgressSummary(context.Background(), "m1", in); codeOf(t, err) != errs.Validation {
				t.Fatalf("Validation 이어야 한다: %v", err)
			}
			if len(repo.summaries) != 0 || m.calls != 0 {
				t.Fatal("저장·전달되면 안 된다")
			}
		})
	}
	// 실제 스냅샷 값(epoch ms·kg 소수·부동소수 찌꺼기·짝 맞는 이모지)은 받는다.
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	svc, _, _ := summarySvc(repo)
	in := sendInput(cid1)
	in.SnapshotJSON = `{"schemaVersion":1,"range":{"startMs":1793068086256,"endMs":1795660086256,"tz":"Asia/Seoul"},` +
		`"volume":{"kg":123456.75,"delta":-0.30000000000000004,"tiny":5.551115123125783e-17},"name":"💪"}`
	if _, err := svc.SendProgressSummary(context.Background(), "m1", in); err != nil {
		t.Fatalf("정상 스냅샷은 받아야 한다: %v", err)
	}
}

// CS-3 — 어느 쪽이 차단했든, 트레이너 쪽 읽기(요약·원본·옛 리포트·루틴)가 모두 막힌다. 회원 본인은 연다.
func TestBlocked_트레이너는_요약도_원본도_리포트도_못_본다(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	repo.records = recordsFixture()
	svc, _, _ := summarySvc(repo)
	ctx := context.Background()
	id := sentSummary(t, repo, svc, cid1)
	start, end := testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli()

	// 차단 전에는 열린다.
	if _, err := svc.GetProgressSummary(ctx, "t1", id); err != nil {
		t.Fatal(err)
	}
	repo.blocked = true
	before := len(repo.audits)
	if _, err := svc.GetProgressSummary(ctx, "t1", id); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("요약 Forbidden: %v", err)
	}
	if _, err := svc.GetMemberRecords(ctx, "t1", "m1", start, end); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("원본 레코드 Forbidden: %v", err)
	}
	if _, err := svc.GetMemberReport(ctx, "t1", "m1"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("옛 리포트 Forbidden: %v", err)
	}
	if _, err := svc.ListMemberRoutines(ctx, "t1", "m1"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("루틴 Forbidden: %v", err)
	}
	if len(repo.audits) != before || len(repo.periodReads) != 0 || repo.listedFor != nil {
		t.Fatalf("거부면 읽지도 감사하지도 않는다: %v %v %v", repo.audits[before:], repo.periodReads, repo.listedFor)
	}
	if _, err := svc.GetProgressSummary(ctx, "m1", id); err != nil {
		t.Fatalf("회원 본인은 연다: %v", err)
	}
}

// CS-4 — 기간 안 레코드가 읽기 예산(16MB)을 넘으면 그 자리에서 멈춘다(세트·종목까지 읽지 않는다).
func TestMemberRecords_읽기_예산을_넘으면_멈춘다(t *testing.T) {
	repo := newRepo()
	activeGrant(repo, fullScope())
	pad := strings.Repeat("x", 1<<20) // 1MB 짜리 자유 글(허용 칸 밖이라 응답에는 안 나간다)
	for i := 0; i < 20; i++ {
		id := fmt.Sprintf("w%02d", i)
		repo.records = append(repo.records, rec("workouts", id, map[string]any{
			"id": id, "state": "completed", "started_at": testNow.Add(-day).UnixMilli(), "notes": pad,
		}))
	}
	repo.records = append(repo.records, rec("workout_exercises", "we1", map[string]any{"id": "we1", "workout_id": "w00"}))
	svc, _, _ := summarySvc(repo)
	_, err := svc.GetMemberRecords(context.Background(), "t1", "m1", testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli())
	if codeOf(t, err) != errs.ResourceExhausted {
		t.Fatalf("ResourceExhausted: %v", err)
	}
	if !slices.Equal(repo.periodReads, []string{"workouts"}) {
		t.Fatalf("운동에서 멈추고 다음 컬렉션을 읽지 않는다: %v", repo.periodReads)
	}
	if len(repo.audits) != 0 {
		t.Fatal("내주지 않았으면 감사도 없다")
	}
}

// CS-6 — 오프라인으로 보낸 뒤(DM 실패) 해지·재계약하고 같은 client_id 를 재전송하면 Forbidden — 전달·알림·감사 없음.
func TestSendSummary_재계약_뒤_옛_요약_재전송은_Forbidden(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	ctx := context.Background()
	svc, m, notif := summarySvc(repo)
	g, err := svc.Request(ctx, "m1", "t1", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, "t1", g.ID); err != nil {
		t.Fatal(err)
	}
	m.failNext = 1
	if _, err := svc.SendProgressSummary(ctx, "m1", sendInput(cid1)); err == nil {
		t.Fatal("DM 실패")
	}
	if _, err := svc.Revoke(ctx, "m1", g.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Request(ctx, "m1", "t1", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, "t1", g.ID); err != nil {
		t.Fatal(err)
	}
	sendAudits := func() int {
		n := 0
		for _, a := range repo.audits {
			if a.Action == ActionSummarySend {
				n++
			}
		}
		return n
	}
	if _, err := svc.SendProgressSummary(ctx, "m1", sendInput(cid1)); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("옛 관계 요약 재전송은 Forbidden: %v", err)
	}
	if len(m.messages) != 0 || len(notif.got) != 0 || sendAudits() != 0 {
		t.Fatalf("전달·알림·감사 없음: %v %v %d", m.messages, notif.got, sendAudits())
	}
	// 새 client_id 로 다시 만들면 보내진다.
	if _, err := svc.SendProgressSummary(ctx, "m1", sendInput(cid2)); err != nil {
		t.Fatal(err)
	}
}

// CS-7 — 같은 요약 반복 열람은 하루 한 번, 원본 반복 열람은 10분에 한 번만 감사.
func TestAudit_반복_열람은_합친다(t *testing.T) {
	repo := newRepo()
	coachPair(repo, "g1", "t1", time.Unix(10, 0))
	repo.records = recordsFixture()
	svc, _, _ := summarySvc(repo)
	ctx := context.Background()
	a := sentSummary(t, repo, svc, cid1)
	b := sentSummary(t, repo, svc, cid2)
	count := func(action string) int {
		n := 0
		for _, x := range repo.audits {
			if x.Action == action {
				n++
			}
		}
		return n
	}
	for i := 0; i < 5; i++ {
		if _, err := svc.GetProgressSummary(ctx, "t1", a); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.GetProgressSummary(ctx, "t1", b); err != nil {
		t.Fatal(err)
	}
	if n := count(ActionSummaryView); n != 2 {
		t.Fatalf("요약마다 한 번(총 2): %d", n)
	}
	start, end := testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli()
	for i := 0; i < 5; i++ {
		if _, err := svc.GetMemberRecords(ctx, "t1", "m1", start-int64(i), end); err != nil {
			t.Fatal(err)
		}
	}
	if n := count(ActionRecordsView); n != 1 {
		t.Fatalf("10분 안 원본 열람은 한 번: %d", n)
	}
	// 창이 지나면 다시 남는다(가짜 DB 시각을 앞당겨 흉내 — 실제 SQL 은 PG 테스트가 본다).
	repo.clock = repo.clock.Add(-25 * time.Hour)
	for i := range repo.auditAt {
		repo.auditAt[i] = repo.clock
	}
	if _, err := svc.GetProgressSummary(ctx, "t1", a); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetMemberRecords(ctx, "t1", "m1", start, end); err != nil {
		t.Fatal(err)
	}
	if count(ActionSummaryView) != 3 || count(ActionRecordsView) != 2 {
		t.Fatalf("창이 지나면 다시: %d %d", count(ActionSummaryView), count(ActionRecordsView))
	}
}
