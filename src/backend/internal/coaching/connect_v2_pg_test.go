// 코칭 v2 실제 Postgres 확인(SPEC-050) — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만
//
// 가짜 저장소가 못 보는 것: 부분 유일 인덱스(코치 한 명)·상태 조건 쿼리의 동시성 · ON CONFLICT 되살리기 ·
// 초대 코드 트랜잭션 · 해지 트랜잭션의 루틴 끝내기 · 동의 시각(DB now()) 컷 · 체중 SQL 필터 · ref_id · 빈 태그 배열.
// 마이그레이션이 끝난 **빈 스크래치 DB**여야 한다(행을 만들고 지운다). 운영·개발 DB 금지.
package coaching

import (
	"context"
	"encoding/json"
	"slices"
	gosync "sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/dm"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/notification"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

type pgRefNotify struct{ svc *notification.Service }

func (a pgRefNotify) NotifyRef(ctx context.Context, userID, actorID, kind, refID string) {
	a.svc.NotifyRef(ctx, userID, actorID, notification.Kind(kind), refID)
}

type pgDM struct{ svc *dm.Service }

func (d pgDM) OpenDirect(ctx context.Context, a, b string) error {
	_, err := d.svc.GetOrCreateDirect(ctx, a, b)
	return err
}

func pgUsers(t *testing.T, pool *pgxpool.Pool, prefix string, n int) []string {
	t.Helper()
	ctx := context.Background()
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		id := prefix + "-" + uuid.NewString()[:8]
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, display_name, trainer_intent) VALUES ($1, $1, true)`, id); err != nil {
			t.Fatal(err)
		}
		out = append(out, id)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`, out) })
	return out
}

func pgV2Svc(pool *pgxpool.Pool) *Service {
	notifSvc := notification.NewService(notification.NewRepo(pool), uuid.NewString)
	dmSvc := dm.NewService(dm.NewRepo(pool), nil, nil, uuid.NewString)
	return NewService(NewRepo(pool), uuid.NewString, time.Now).
		WithSummaryDelivery(dmSvc, pgNotify{notifSvc}).
		WithConnectPorts(pgRefNotify{notifSvc}, pgDM{dmSvc})
}

func pgCount(t *testing.T, pool *pgxpool.Pool, q string, args ...any) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// 동시 수락 — 한 회원이 두 코치의 요청을 동시에 수락하면 둘 중 하나만 활성이 된다(one_coach 인덱스).
// 같은 요청을 동시에 두 번 수락해도 하나만 성공한다(AND status='pending').
func TestV2_Postgres_동시_수락은_하나만(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)

	for round := 0; round < 5; round++ {
		u := pgUsers(t, pool, "v2c", 3)
		member, t1, t2 := u[0], u[1], u[2]
		g1, err := svc.RequestCoaching(ctx, t1, RequestInput{MemberID: member})
		if err != nil {
			t.Fatal(err)
		}
		g2, err := svc.RequestCoaching(ctx, t2, RequestInput{MemberID: member})
		if err != nil {
			t.Fatal(err)
		}
		var wg gosync.WaitGroup
		res := make([]error, 2)
		for i, gid := range []string{g1.ID, g2.ID} {
			wg.Add(1)
			go func(i int, gid string) {
				defer wg.Done()
				_, res[i] = svc.Accept(ctx, member, gid)
			}(i, gid)
		}
		wg.Wait()
		ok := 0
		for _, err := range res {
			switch {
			case err == nil:
				ok++
			case codeOf(t, err) == errs.Conflict && domainMsg(t, err) == msgOneCoach:
			default:
				t.Fatalf("예상 밖: %v", err)
			}
		}
		if ok != 1 {
			t.Fatalf("둘 중 하나만 성공: %v", res)
		}
		if n := pgCount(t, pool, `SELECT count(*) FROM coaching_grants WHERE member_id=$1 AND status='active'`, member); n != 1 {
			t.Fatalf("활성 1개: %d", n)
		}
	}

	// 같은 요청 동시 두 번.
	u := pgUsers(t, pool, "v2d", 2)
	g, err := svc.RequestCoaching(ctx, u[1], RequestInput{MemberID: u[0]})
	if err != nil {
		t.Fatal(err)
	}
	var wg gosync.WaitGroup
	res := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); _, res[i] = svc.Accept(ctx, u[0], g.ID) }(i)
	}
	wg.Wait()
	if (res[0] == nil) == (res[1] == nil) {
		t.Fatalf("하나만 성공: %v", res)
	}
	for _, err := range res {
		if err != nil && codeOf(t, err) != errs.Conflict && codeOf(t, err) != errs.Validation {
			t.Fatalf("둘째는 Conflict(쿼리 0행) 또는 Validation(서비스가 먼저 봄): %v", err)
		}
	}
	// 수락 알림 1건(ref_id = 관계 id · post_id 비움) · 대화방 1개.
	if n := pgCount(t, pool, `SELECT count(*) FROM notifications WHERE user_id=$1 AND kind='coaching_accept' AND ref_id=$2 AND post_id IS NULL`, u[1], g.ID); n != 1 {
		t.Fatalf("수락 알림 1건: %d", n)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM conversation_participants WHERE user_id=$1`, u[0]); n < 1 {
		t.Fatalf("대화방: %d", n)
	}
}

func TestV2_Postgres_범위_기본값_되살리기_해지(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	u := pgUsers(t, pool, "v2s", 2)
	member, trainer := u[0], u[1]

	wide := Scope{LogView: true, RoutineEdit: true, BodyView: true, PastRecords: true}
	g, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer, Scope: &wide, Note: "부탁해요"})
	if err != nil {
		t.Fatal(err)
	}
	var raw []byte
	var note string
	if err := pool.QueryRow(ctx, `SELECT scope, request_note FROM coaching_grants WHERE id=$1`, g.ID).Scan(&raw, &note); err != nil {
		t.Fatal(err)
	}
	var keys map[string]bool
	_ = json.Unmarshal(raw, &keys)
	if len(keys) != 4 || !keys["bodyView"] || note != "부탁해요" {
		t.Fatalf("저장 키 4개·메시지: %s %q", raw, note)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	// 해지 — 그 관계의 활성 코치 루틴도 끝난다(한 트랜잭션).
	if _, err := pool.Exec(ctx, `INSERT INTO coaching_routines (id, grant_id, trainer_id, member_id, source_routine_id, member_routine_id)
		VALUES ($1, $2, $3, $4, 'draft-1', 'coach-x')`, uuid.NewString(), g.ID, trainer, member); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Revoke(ctx, member, g.ID); err != nil {
		t.Fatal(err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_routines WHERE grant_id=$1 AND status='ended'`, g.ID); n != 1 {
		t.Fatalf("코치 루틴 ended: %d", n)
	}
	if _, err := svc.Revoke(ctx, member, g.ID); err == nil {
		t.Fatal("두 번째 해지는 거절")
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM notifications WHERE user_id=$1 AND kind='coaching_revoke' AND ref_id=$2`, trainer, g.ID); n != 1 {
		t.Fatalf("해지 알림: %d", n)
	}
	// 다시 요청 — 범위 없이 → 기본값(옛 bodyView·pastRecords 가 되살아나지 않는다).
	g2, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer})
	if err != nil {
		t.Fatal(err)
	}
	if g2.ID != g.ID || ScopeOf(g2.Scope) != DefaultScope() || g2.RequestNote != "" {
		t.Fatalf("같은 행 · 기본 범위: %+v", g2)
	}
	// 범위 바꾸기 — pending 이면 Conflict.
	if _, err := svc.UpdateScope(ctx, member, g.ID, wide); codeOf(t, err) != errs.Conflict {
		t.Fatalf("pending 범위 바꾸기: %v", err)
	}
	if _, err := svc.AcceptWith(ctx, trainer, g.ID, &wide); err != nil {
		t.Fatal(err)
	}
	if got, _ := NewRepo(pool).GetGrant(ctx, g.ID); ScopeOf(got.Scope) != DefaultScope() {
		t.Fatalf("코치 수락 범위는 무시: %+v", got.Scope)
	}
	after, err := svc.UpdateScope(ctx, member, g.ID, wide)
	if err != nil || ScopeOf(after.Scope) != wide {
		t.Fatalf("범위 바꾸기: %+v %v", after, err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action='scope_change'`, g.ID); n != 1 {
		t.Fatalf("scope_change 감사: %d", n)
	}
}

func TestV2_Postgres_초대_코드(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	u := pgUsers(t, pool, "v2i", 3)
	member, trainer, other := u[0], u[1], u[2]

	first, err := svc.CreateInvite(ctx, trainer)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.CreateInvite(ctx, trainer)
	if err != nil {
		t.Fatal(err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_invites WHERE trainer_id=$1 AND revoked_at IS NULL`, trainer); n != 1 {
		t.Fatalf("살아 있는 코드 1개: %d", n)
	}
	if _, _, err := svc.GetInvite(ctx, member, first.Code); codeOf(t, err) != errs.NotFound {
		t.Fatalf("옛 코드 NotFound: %v", err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_audits WHERE grant_id IS NULL AND actor_id=$1 AND action='invite_create'`, trainer); n != 2 {
		t.Fatalf("invite_create 감사(관계 없음): %d", n)
	}
	// 같은 쌍의 옛 관계(revoked)는 되살린다.
	g0, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Revoke(ctx, member, g0.ID); err != nil {
		t.Fatal(err)
	}
	code := second.Code[:4] + "-" + second.Code[4:]
	sc := Scope{LogView: true, BodyView: true}
	g, err := svc.AcceptInvite(ctx, member, code, &sc)
	if err != nil {
		t.Fatal(err)
	}
	if g.ID != g0.ID || g.Status != StatusActive || ScopeOf(g.Scope) != sc || g.ConsentAt.IsZero() {
		t.Fatalf("되살림·활성·범위: %+v", g)
	}
	if _, err := svc.AcceptInvite(ctx, member, code, nil); codeOf(t, err) != errs.Conflict {
		t.Fatalf("이미 연결: %v", err)
	}
	// 다른 코치의 코드 → 코치 한 명.
	oc, err := svc.CreateInvite(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AcceptInvite(ctx, member, oc.Code, nil); domainMsg(t, err) != msgOneCoach {
		t.Fatalf("둘째 코치: %v", err)
	}
	// 만료 — 조회할 때 회수.
	if _, err := pool.Exec(ctx, `UPDATE coaching_invites SET expires_at = now() - interval '1 second' WHERE code=$1`, oc.Code); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.GetInvite(ctx, member, oc.Code); domainMsg(t, err) != msgInviteNotFound {
		t.Fatalf("만료: %v", err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_invites WHERE code=$1 AND revoked_at IS NOT NULL`, oc.Code); n != 1 {
		t.Fatalf("만료 회수: %d", n)
	}
}

func TestV2_Postgres_동의_전_기록_컷과_체중(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	u := pgUsers(t, pool, "v2r", 2)
	member, trainer := u[0], u[1]
	g, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer, Scope: &Scope{LogView: true}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	got, err := NewRepo(pool).GetGrant(ctx, g.ID)
	if err != nil {
		t.Fatal(err)
	}
	consent := got.ConsentAt
	before, after := consent.Add(-time.Second).UnixMilli(), consent.Add(time.Second).UnixMilli()
	put := func(collection, id string, m map[string]any) {
		t.Helper()
		b, _ := json.Marshal(m)
		if _, err := pool.Exec(ctx, `INSERT INTO sync_records (id, user_id, collection, record_id, payload) VALUES ($1, $2, $3, $4, $5::jsonb)`,
			uuid.NewString(), member, collection, id, string(b)); err != nil {
			t.Fatal(err)
		}
	}
	put("workouts", "wb", map[string]any{"id": "wb", "state": "completed", "started_at": before})
	put("workouts", "wa", map[string]any{"id": "wa", "state": "completed", "started_at": after})
	put("bodyweight_logs", "bb", map[string]any{"id": "bb", "measured_at": before, "weight_kg": 80})
	put("bodyweight_logs", "ba", map[string]any{"id": "ba", "measured_at": after, "weight_kg": 79, "note": "비밀", "body_fat_pct": 18})
	put("bodyweight_logs", "bs", map[string]any{"id": "bs", "measured_at": "어제", "weight_kg": 81}) // 글자 — 캐스트 오류 없이 빠진다

	start, end := time.Now().Add(-28*day).UnixMilli(), time.Now().Add(time.Hour).UnixMilli()
	r, err := svc.GetMemberRecords(ctx, trainer, member, start, end)
	if err != nil {
		t.Fatal(err)
	}
	if ids := idsOf(t, r.Workouts); !slices.Equal(ids, []string{"wa"}) || len(r.BodyweightLogs) != 0 {
		t.Fatalf("동의 1초 전 운동 0건 · bodyView 없으면 체중 0건: %v %v", ids, r.BodyweightLogs)
	}
	if !r.ServedStart.Equal(consent) {
		t.Fatalf("servedStart = 동의 시각: %v %v", r.ServedStart, consent)
	}
	if _, err := svc.UpdateScope(ctx, member, g.ID, Scope{LogView: true, BodyView: true}); err != nil {
		t.Fatal(err)
	}
	r, err = svc.GetMemberRecords(ctx, trainer, member, start, end)
	if err != nil {
		t.Fatal(err)
	}
	if ids := idsOf(t, r.BodyweightLogs); !slices.Equal(ids, []string{"ba"}) {
		t.Fatalf("동의 뒤 체중만: %v", ids)
	}
	var row map[string]any
	_ = json.Unmarshal([]byte(r.BodyweightLogs[0]), &row)
	if _, leaked := row["note"]; leaked || len(row) != 4 { // id·measured_at·weight_kg·body_fat_pct(골격근량은 없는 칸)
		t.Fatalf("허용 칸만: %v", row)
	}
}

func idsOf(t *testing.T, list []string) []string {
	t.Helper()
	out := []string{}
	for _, s := range list {
		var m map[string]any
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			t.Fatal(err)
		}
		out = append(out, m["id"].(string))
	}
	return out
}

// 프로필 코치 태그 — 안 보낸 칸도 NULL 이 되지 않고, 보낸 태그는 그대로 · 노출(Peer)도 빈 배열.
func TestV2_Postgres_코치_소개_태그(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	u := pgUsers(t, pool, "v2p", 1)
	repo := auth.NewRepo(pool)
	// 태그를 보내지 않은 갱신(서비스는 빈 슬라이스로 채운다 — 저장소에 nil 이 와도 NULL 이 되지 않아야 한다).
	if _, err := repo.UpdateProfile(ctx, u[0], auth.ProfilePatch{SetDisplayName: true, DisplayName: "코치"}); err != nil {
		t.Fatalf("태그 nil 이어도 NOT NULL 위반 없음: %v", err)
	}
	user, err := repo.UpdateProfile(ctx, u[0], auth.ProfilePatch{
		SetCoachBio: true, CoachBio: "근비대 전문", SetCoachTags: true, CoachTags: []string{"hypertrophy", "diet"},
	})
	if err != nil || user.CoachBio != "근비대 전문" || !slices.Equal(user.CoachTags, []string{"hypertrophy", "diet"}) {
		t.Fatalf("저장: %+v %v", user, err)
	}
	p, err := NewRepo(pool).GetPeer(ctx, u[0])
	if err != nil || p.CoachBio != "근비대 전문" || len(p.CoachTags) != 2 {
		t.Fatalf("Peer 노출: %+v %v", p, err)
	}
	if _, err := repo.UpdateProfile(ctx, u[0], auth.ProfilePatch{SetCoachTags: true, CoachTags: nil}); err != nil {
		t.Fatalf("태그 비우기(nil): %v", err)
	}
	if p, _ := NewRepo(pool).GetPeer(ctx, u[0]); p.CoachTags == nil || len(p.CoachTags) != 0 {
		t.Fatalf("빈 배열: %#v", p.CoachTags)
	}
}
