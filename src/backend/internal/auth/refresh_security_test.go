// @plm SRS-083  세션 갱신 보안 회귀 — 유예가 재사용 탐지를 무력화하지 않는다(/qa code H-1·H-2·H-3)
//
// 규칙(「미사용 후계」): 회전된 토큰 R 이 다시 오면 R 의 후계 S 가 **아직 한 번도 쓰이지 않았을 때만**
// 응답 유실로 보고 S 를 대체(superseded)해 새 후계를 준다. S 가 이미 쓰였으면 재사용이다 → 계열 전체 폐기.
// 그래서 한 계열에 살아 있는 토큰은 언제나 하나이고, 공격자와 정상 클라이언트 중 하나는 반드시
// 무효 토큰을 내밀게 된다(RFC 9700 §4.14.2).
package auth

import (
	"context"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// liveInFamily — 그 토큰이 속한 계열에 살아 있는(폐기·만료 아님) 토큰 수.
func liveInFamily(repo *fakeRepo, raw string) int {
	fam := repo.tokens[hashToken(raw)].FamilyID
	n := 0
	for _, t := range repo.tokens {
		if t.FamilyID == fam && t.RevokedAt == nil && t.ExpiresAt.After(repo.now()) {
			n++
		}
	}
	return n
}

// 공격자가 훔친 토큰을 **먼저** 쓰고 피해자가 나중에 와도, 결국 재사용이 드러나 계열이 끊긴다.
func TestRefreshAttackerFirstIsDetected(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, ta, err := svc.Refresh(ctx, t0.RefreshToken) // 공격자
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(10 * time.Minute)
	_, tv, err := svc.Refresh(ctx, t0.RefreshToken) // 피해자 — 응답 유실처럼 보인다(후계 Ta 미사용) → 구제
	if err != nil {
		t.Fatalf("피해자(후계 미사용)가 구제되지 않았다: %v", err)
	}
	now = now.Add(time.Minute)
	if _, _, err := svc.Refresh(ctx, ta.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("대체된 공격자 토큰이 30초 밖에서 통했다 — 재사용 탐지 실패")
	}
	if _, _, err := svc.Refresh(ctx, tv.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("재사용이 드러났는데 계열이 끊기지 않았다")
	}
}

// 공격자가 훔친 옛 토큰을 **나중에** 써도(피해자 후계가 아직 미사용) 피해자가 돌아오는 순간 드러난다.
func TestRefreshAttackerLaterIsDetected(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, t1, err := svc.Refresh(ctx, t0.RefreshToken) // 피해자 회전 후 며칠 쉰다
	if err != nil {
		t.Fatal(err)
	}
	// [원본] 48시간 뒤 — 회전된 토큰 구제에 시간 상한이 없던 때의 시나리오(재검토 N-1). 상한(60분) 밖 재사용은
	// 이제 즉시 계열 폐기다 → TestRefreshRotatedRescueCapped 가 맡는다.
	// now = now.Add(48 * time.Hour)
	now = now.Add(30 * time.Minute)
	_, ta, err := svc.Refresh(ctx, t0.RefreshToken) // 공격자가 로그·백업에서 얻은 T0
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Hour)
	if _, _, err := svc.Refresh(ctx, t1.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("대체된 피해자 토큰이 통했다 — 공격자와 평행 세션이 생겼다")
	}
	if _, _, err := svc.Refresh(ctx, ta.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("재사용이 드러났는데 공격자 토큰이 살아남았다")
	}
}

// 회전된 토큰 하나로 갱신을 몇 번 해도 계열에 살아 있는 토큰은 하나다(H-2).
func TestRefreshReplayKeepsOneLiveToken(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, t0.RefreshToken); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		now = now.Add(time.Second)
		_, _, _ = svc.Refresh(ctx, t0.RefreshToken)
		if n := liveInFamily(repo, t0.RefreshToken); n > 1 {
			t.Fatalf("%d번째 재사용 뒤 계열에 살아 있는 토큰이 %d개다", i+1, n)
		}
	}
}

// 대체된(superseded) 토큰이 30초 안에 오면 탭 경합으로 보고 살린다 — 살아 있는 토큰은 여전히 하나.
func TestRefreshSupersededWithinGraceRescued(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, a, err := svc.Refresh(ctx, t0.RefreshToken) // 탭 A
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, t0.RefreshToken); err != nil { // 탭 B — A 의 후계를 대체
		t.Fatal(err)
	}
	now = now.Add(5 * time.Second)
	if _, _, err := svc.Refresh(ctx, a.RefreshToken); err != nil { // 쿠키 저장소에 A 쪽이 남았다
		t.Fatalf("30초 안 대체 토큰이 로그아웃시켰다: %v", err)
	}
	if n := liveInFamily(repo, t0.RefreshToken); n != 1 {
		t.Fatalf("계열에 살아 있는 토큰이 %d개다(1이어야)", n)
	}
}

// 비밀번호 변경 뒤에는 회전된 옛 토큰도, 이 기기 밖의 살아 있던 토큰도 되살아나지 않는다.
func TestChangePasswordClosesGrace(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _ := newAccountService(t)
	u, first, err := svc.SignUp(ctx, "a@x.com", "password1", "")
	if err != nil {
		t.Fatal(err)
	}
	_, second, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ChangePassword(ctx, u.ID, "password1", "newpassword9"); err != nil {
		t.Fatal(err)
	}
	for name, tok := range map[string]string{"회전된 옛": first.RefreshToken, "살아 있던": second.RefreshToken} {
		if _, _, err := svc.Refresh(ctx, tok); domainCode(t, err) != errs.Unauthorized {
			t.Fatalf("비밀번호 변경 뒤 %s 토큰이 통했다", name)
		}
	}
}

// 회전된 토큰의 「미사용 후계」 구제는 회전 시각부터 60분까지만이다(재검토 N-1). 그 밖은 재사용 → 계열 폐기.
// 잠수한 기기의 옛 토큰을 공격자가 수 주 동안 쓰는 창을 닫는다.
func TestRefreshRotatedRescueCapped(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, t1, err := svc.Refresh(ctx, t0.RefreshToken) // 회전 — 피해자는 T1 을 들고 잠수
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(refreshRotatedRescue + time.Minute)
	if _, _, err := svc.Refresh(ctx, t0.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("회전 뒤 상한을 넘긴 옛 토큰이 통했다")
	}
	if n := liveInFamily(repo, t0.RefreshToken); n != 0 {
		t.Fatalf("상한 밖 재사용인데 계열이 끊기지 않았다(살아 있는 토큰 %d개)", n)
	}
	if _, _, err := svc.Refresh(ctx, t1.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("계열이 끊겼는데 후계 T1 이 살아 있다")
	}
}

// 상한 안(응답 유실 뒤 앱을 닫았다 59분 만에 다시 연 경우)은 계속 구제된다.
func TestRefreshRotatedRescueWithinCap(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, t0.RefreshToken); err != nil { // 응답이 길에서 사라졌다
		t.Fatal(err)
	}
	now = now.Add(refreshRotatedRescue - time.Minute)
	if _, _, err := svc.Refresh(ctx, t0.RefreshToken); err != nil {
		t.Fatalf("상한 안의 응답 유실이 구제되지 않았다: %v", err)
	}
}

// 이미 끝난 토큰(재사용·로그아웃·전체 폐기)은 사용자 잠금을 잡지 않고 바로 거절한다(재검토 N-5) — 폐기는 되돌아가지
// 않으므로 잠금 밖 판단이 안전하고, 탐지된 토큰 폭주가 계열 UPDATE·연결을 소모하지 않는다.
func TestRefreshDeadTokenSkipsLock(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, t0, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.LogOut(ctx, t0.RefreshToken); err != nil {
		t.Fatal(err)
	}
	before := repo.lockCalls
	for i := 0; i < 5; i++ {
		if _, _, err := svc.Refresh(ctx, t0.RefreshToken); domainCode(t, err) != errs.Unauthorized {
			t.Fatal("로그아웃한 토큰이 통했다")
		}
	}
	if got := repo.lockCalls - before; got != 0 {
		t.Fatalf("끝난 토큰 갱신이 잠금을 %d번 잡았다", got)
	}
}
