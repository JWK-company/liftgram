// @plm SRS-080  실제 Postgres 로 보는 요약 흐름(선택) — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만
//
// 가짜 저장소 테스트가 못 보는 것: ON CONFLICT DO NOTHING RETURNING 의 0행 · message_id IS NULL 조건 ·
// 결정적 메시지 id 의 기본 키 충돌 · 동시 요청 · timestamptz 동의 시각 비교 · µs 커서.
// 마이그레이션이 끝난 **빈 스크래치 DB**를 가리켜야 한다(행을 만들고 지운다). 운영·개발 DB 금지.
package coaching

import (
	"context"
	"os"
	gosync "sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/dm"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/notification"
)

type pgNotify struct{ svc *notification.Service }

func (a pgNotify) Notify(ctx context.Context, userID, actorID, kind, postID string) {
	a.svc.Notify(ctx, userID, actorID, notification.Kind(kind), postID)
}

func TestSummary_실제_Postgres_흐름(t *testing.T) {
	url := os.Getenv("LIFTGRAM_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("LIFTGRAM_TEST_DATABASE_URL 없음")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	member, trainer := "it-m-"+uuid.NewString()[:8], "it-t-"+uuid.NewString()[:8]
	for _, u := range []string{member, trainer} {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, display_name, trainer_intent) VALUES ($1, $1, true)`, u); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{member, trainer})
	}()

	repo := NewRepo(pool)
	dmSvc := dm.NewService(dm.NewRepo(pool), nil, nil, uuid.NewString)
	notifSvc := notification.NewService(notification.NewRepo(pool), uuid.NewString)
	svc := NewService(repo, uuid.NewString, time.Now).WithSummaryDelivery(dmSvc, pgNotify{notifSvc})

	g, err := svc.Request(ctx, member, trainer, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}

	now := time.Now()
	in := SendSummaryInput{
		TrainerID: trainer, PeriodStartMs: now.Add(-28 * day).UnixMilli(), PeriodEndMs: now.UnixMilli(),
		SchemaVersion: 1, SnapshotJSON: `{"schemaVersion":1,"counts":{"workouts":3}}`, ClientID: uuid.NewString(),
	}
	count := func(q string, args ...any) int {
		t.Helper()
		var n int
		if err := pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	// 보내기 + 재전송 → 행 1 · SUMMARY 메시지 1(ref_id) · 알림 1 · 감사 summary_send 1.
	id, err := svc.SendProgressSummary(ctx, member, in)
	if err != nil {
		t.Fatal(err)
	}
	if again, err := svc.SendProgressSummary(ctx, member, in); err != nil || again != id {
		t.Fatalf("재전송: %s %v", again, err)
	}
	if n := count(`SELECT count(*) FROM messages WHERE kind='summary' AND ref_id=$1 AND sender_id=$2`, id, member); n != 1 {
		t.Fatalf("SUMMARY 메시지 1건: %d", n)
	}
	if n := count(`SELECT count(*) FROM notifications WHERE kind='coaching_summary' AND user_id=$1 AND post_id IS NULL`, trainer); n != 1 {
		t.Fatalf("알림 1건: %d", n)
	}
	if n := count(`SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action='summary_send'`, g.ID); n != 1 {
		t.Fatalf("감사 1건: %d", n)
	}

	// 동시 두 요청(새 client_id) → 메시지 1건.
	in2 := in
	in2.ClientID = uuid.NewString()
	var wg gosync.WaitGroup
	got := make([]string, 2)
	errsOut := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			got[i], errsOut[i] = svc.SendProgressSummary(ctx, member, in2)
		}(i)
	}
	wg.Wait()
	if errsOut[0] != nil || errsOut[1] != nil || got[0] != got[1] {
		t.Fatalf("동시 요청: %v %v %v", got, errsOut[0], errsOut[1])
	}
	if n := count(`SELECT count(*) FROM messages WHERE ref_id=$1`, got[0]); n != 1 {
		t.Fatalf("동시 요청이어도 메시지 1건: %d", n)
	}
	if n := count(`SELECT count(*) FROM notifications WHERE kind='coaching_summary' AND user_id=$1`, trainer); n != 2 {
		t.Fatalf("알림은 요약마다 1건(총 2): %d", n)
	}

	// 트레이너 열람 → 해지 → 재계약 → 옛 요약 거부 · 새 요약 허용(timestamptz 비교).
	if _, err := svc.GetProgressSummary(ctx, trainer, id); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Revoke(ctx, member, g.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProgressSummary(ctx, trainer, id); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("해지 뒤 Forbidden: %v", err)
	}
	if _, err := svc.Request(ctx, member, trainer, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProgressSummary(ctx, trainer, id); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("재계약 뒤 옛 요약 Forbidden: %v", err)
	}
	in3 := in
	in3.ClientID = uuid.NewString()
	fresh, err := svc.SendProgressSummary(ctx, member, in3)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProgressSummary(ctx, trainer, fresh); err != nil {
		t.Fatalf("새 요약은 열린다: %v", err)
	}

	// 목록 — 최신 먼저 · 전달됨 · 스냅샷 없음.
	rows, next, err := svc.ListSentSummaries(ctx, member, "")
	if err != nil || len(rows) != 3 || next != "" || rows[0].ID != fresh || !rows[0].Delivered {
		t.Fatalf("목록: %+v %q %v", rows, next, err)
	}

	// DM 목록 미리보기에도 SUMMARY 와 ref_id 가 실린다(숫자 없는 body).
	convs, err := dmSvc.ListConversations(ctx, trainer)
	if err != nil || len(convs) != 1 || convs[0].LastMessage == nil {
		t.Fatalf("대화: %+v %v", convs, err)
	}
	if lm := convs[0].LastMessage; lm.Kind != dm.KindSummary || lm.RefID != fresh || lm.Body != dm.SummaryFallbackBody {
		t.Fatalf("미리보기: %+v", lm)
	}
}
