// 코치 역할 없애기(SPEC-052) 실제 Postgres 확인 — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만
//
// 노출 스위치(trainer_intent)를 끈 두 사람이 초대 코드로 연결되면 그때 코치가 생긴다:
// 파생값 is_coach 가 코칭(ListGrants·GetInvite)·피드(프로필·사람 찾기)·내 계정(auth WithCoach)에서 같이 바뀌고,
// 해지하면 같이 사라진다. 코치 찾기 검색은 노출을 켠 사람만(그대로).
package coaching

import (
	"context"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/feed"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestSPEC052_Postgres_코치는_연결에서_생긴다(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	q := sqlcgen.New(pool)
	feedRepo := feed.NewRepo(pool)
	authSvc := auth.NewService(nil, nil)
	authSvc.WithCoachCheck(q.IsActiveCoach)

	tag := uuid.NewString()[:8]
	coach, member, other, shown := "c52c-"+tag, "c52m-"+tag, "c52o-"+tag, "c52s-"+tag
	ids := []string{coach, member, other, shown}
	for _, id := range ids {
		intent := id == shown // 코치 찾기 노출은 shown 만 켰다
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, display_name, trainer_intent) VALUES ($1, $1, $2)`, id, intent); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`, ids) })

	isCoach := func(id string) bool {
		t.Helper()
		ok, err := q.IsActiveCoach(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return ok
	}
	searchCoach := func(viewer, name string) (found, coachFlag bool) {
		t.Helper()
		us, err := feedRepo.SearchUsers(ctx, viewer, name, 10)
		if err != nil {
			t.Fatal(err)
		}
		for _, u := range us {
			if u.Author.ID == name {
				return true, u.IsCoach
			}
		}
		return false, false
	}

	// 연결 전 — 아무도 코치가 아니다
	if isCoach(coach) || authSvc.WithCoach(ctx, auth.User{ID: coach}).IsCoach {
		t.Fatal("연결 전에는 코치가 아니다")
	}
	if found, flag := searchCoach(member, coach); !found || flag {
		t.Fatalf("사람 찾기에는 나오되 배지는 없다: found=%v coach=%v", found, flag)
	}

	// 노출을 끈 사람도 초대 코드를 만든다 → 회원이 코드로 연결
	inv, err := svc.CreateInvite(ctx, coach)
	if err != nil {
		t.Fatalf("노출을 꺼도 코드를 만든다: %v", err)
	}
	peer, _, err := svc.GetInvite(ctx, member, inv.Code)
	if err != nil || peer.ID != coach || peer.IsCoach {
		t.Fatalf("연결 전 코드 카드 — 배지 없음: %+v %v", peer, err)
	}
	g, err := svc.AcceptInvite(ctx, member, inv.Code, nil)
	if err != nil || g.Status != StatusActive {
		t.Fatalf("코드 연결: %+v %v", g, err)
	}

	// 연결 뒤 — 파생값이 모든 길에서 같이 바뀐다
	if !isCoach(coach) || isCoach(member) {
		t.Fatal("코치 쪽만 코치가 된다")
	}
	if !authSvc.WithCoach(ctx, auth.User{ID: coach}).IsCoach || authSvc.WithCoach(ctx, auth.User{ID: member}).IsCoach {
		t.Fatal("내 계정 is_coach")
	}
	gs, err := svc.ListGrants(ctx, member)
	if err != nil || len(gs) != 1 || !gs[0].Peer.IsCoach || gs[0].Peer.TrainerIntent {
		t.Fatalf("회원이 보는 연결 — 상대 배지 있음·노출은 꺼짐 그대로: %+v %v", gs, err)
	}
	gs, err = svc.ListGrants(ctx, coach)
	if err != nil || len(gs) != 1 || gs[0].Peer.IsCoach {
		t.Fatalf("코치가 보는 회원 — 회원은 코치가 아니다: %+v %v", gs, err)
	}
	if found, flag := searchCoach(other, coach); !found || !flag {
		t.Fatalf("사람 찾기 배지: found=%v coach=%v", found, flag)
	}
	card, err := feedRepo.GetCoachCard(ctx, coach)
	if err != nil || !card.IsCoach || card.TrainerIntent {
		t.Fatalf("프로필 코치 카드: %+v %v", card, err)
	}
	// 코치 찾기 검색은 노출을 켠 사람만 — 연결이 있어도 노출을 끈 코치는 안 나온다
	found, err := svc.SearchTrainers(ctx, other, "c52")
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, p := range found {
		names = append(names, p.ID)
	}
	if !slices.Contains(names, shown) || slices.Contains(names, coach) {
		t.Fatalf("코치 찾기 = 노출 켠 사람만: %v", names)
	}

	// 남는 규칙 — 회원 한 명당 코치 한 명: other(노출 끔)가 member 를 회원으로 초대하면 수락에서 막힌다
	g2, err := svc.RequestCoaching(ctx, other, RequestInput{MemberID: member})
	if err != nil {
		t.Fatalf("노출을 끈 사람도 회원 초대를 보낸다: %v", err)
	}
	if isCoach(other) {
		t.Fatal("대기 중인 연결로는 코치가 아니다")
	}
	if _, err := svc.Accept(ctx, member, g2.ID); codeOf(t, err) != errs.Conflict {
		t.Fatalf("코치는 한 명: %v", err)
	}
	// 소개 보이는 곳 규칙(REV-105 U7b) — 노출을 끈 코치의 소개·태그는 연결 줄에도 안 나간다
	if _, err := pool.Exec(ctx, `UPDATE users SET coach_bio = '근비대', coach_tags = '{strength}' WHERE id = $1`, coach); err != nil {
		t.Fatal(err)
	}
	coachPeer := func() Peer {
		t.Helper()
		gs, err := svc.ListGrants(ctx, member)
		if err != nil {
			t.Fatal(err)
		}
		for _, x := range gs {
			if x.ID == g.ID {
				return x.Peer
			}
		}
		t.Fatal("코치 연결 줄이 없다")
		return Peer{}
	}
	if p := coachPeer(); p.CoachBio != "" || len(p.CoachTags) != 0 {
		t.Fatalf("노출 끔 → 소개·태그 비움: %+v", p)
	}
	if c, err := feedRepo.GetCoachCard(ctx, coach); err != nil || c.Bio != "" || len(c.Tags) != 0 || !c.IsCoach {
		t.Fatalf("피드 프로필도 노출 끔 → 소개·태그 비움(REV-106 S2): %+v %v", c, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET trainer_intent = true WHERE id = $1`, coach); err != nil {
		t.Fatal(err)
	}
	if p := coachPeer(); p.CoachBio != "근비대" || len(p.CoachTags) != 1 {
		t.Fatalf("노출 켬 → 소개 보임: %+v", p)
	}
	if c, _ := feedRepo.GetCoachCard(ctx, coach); c.Bio != "근비대" || len(c.Tags) != 1 {
		t.Fatalf("피드 프로필 노출 켬 → 소개 보임: %+v", c)
	}

	// 해지 → 배지가 사라진다
	if _, err := svc.Revoke(ctx, member, g.ID); err != nil {
		t.Fatal(err)
	}
	if isCoach(coach) {
		t.Fatal("해지하면 코치가 아니다")
	}
	if card, _ := feedRepo.GetCoachCard(ctx, coach); card.IsCoach {
		t.Fatal("해지 뒤 프로필 배지 없음")
	}
}
