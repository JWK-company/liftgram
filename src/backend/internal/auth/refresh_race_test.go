// @plm SRS-083  세션 갱신 경합 — 응답을 못 받은 회전·탭 동시 갱신이 로그아웃을 일으키지 않는다
//
// 회전은 그대로 하되, 회전으로 폐기된 토큰을 **새 토큰이 아직 쓰이지 않았거나 30초 안**이면
// 같은 계열의 새 토큰으로 다시 바꿔 준다(응답 유실·탭 경합). 그 밖의 재사용은 탈취로 보고
// 계열 전체를 끊는다(재사용 탐지). 로그아웃·전체 폐기로 끊긴 계열에는 유예가 없다.
package auth

import (
	"context"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 같은 쿠키로 두 문서가 동시에 갱신한다 — 둘 다 성공해야 한다(탭 경합).
func TestRefreshSameTokenTwiceBothSucceed(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, first, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, a, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatalf("첫 갱신 실패: %v", err)
	}
	_, b, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatalf("같은 토큰 두 번째 갱신이 로그아웃시켰다(유예 없음): %v", err)
	}
	if a.RefreshToken == b.RefreshToken {
		t.Fatal("두 갱신이 같은 refresh를 돌려줬다")
	}
	// 어느 쪽 쿠키가 남든 다음 갱신이 통해야 한다.
	if _, _, err := svc.Refresh(ctx, a.RefreshToken); err != nil {
		t.Fatalf("이긴 쪽 새 토큰이 죽었다: %v", err)
	}
	if _, _, err := svc.Refresh(ctx, b.RefreshToken); err != nil {
		t.Fatalf("진 쪽 새 토큰이 죽었다: %v", err)
	}
}

// 갱신 응답이 브라우저에 닿지 못했다 — 몇 분 뒤 옛 쿠키로 다시 와도 살린다(새 토큰이 쓰인 적 없음).
func TestRefreshLostResponseLaterStillWorks(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, first, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, first.RefreshToken); err != nil { // 응답이 사라진 회전
		t.Fatal(err)
	}
	now = now.Add(5 * time.Minute) // 앱을 닫았다가 5분 뒤 다시 연다
	if _, _, err := svc.Refresh(ctx, first.RefreshToken); err != nil {
		t.Fatalf("응답 유실 뒤 다시 연 앱이 로그아웃됐다: %v", err)
	}
}

// 새 토큰이 이미 쓰인 뒤, 30초가 지나 옛 토큰이 다시 오면 탈취다 — 계열 전체를 끊는다.
func TestRefreshStaleReuseRevokesFamily(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	now := time.Date(2026, 10, 27, 9, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return now }
	_, first, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, second, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	_, third, err := svc.Refresh(ctx, second.RefreshToken) // 정상 사용자가 계속 쓴다
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	if _, _, err := svc.Refresh(ctx, first.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("이미 다음 회전이 일어난 옛 토큰이 통했다")
	}
	if _, _, err := svc.Refresh(ctx, third.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("재사용이 드러났는데 그 계열의 살아 있는 토큰이 남았다")
	}
}

// 로그아웃은 유예 없이, 유예로 생긴 형제까지 끊는다. 다른 기기는 그대로.
func TestLogOutClosesGraceAndSiblings(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, phone, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	_, laptop, err := svc.LogIn(ctx, "a@b.com", "hunter22!")
	if err != nil {
		t.Fatal(err)
	}
	_, s1, err := svc.Refresh(ctx, phone.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	_, s2, err := svc.Refresh(ctx, phone.RefreshToken) // 유예로 생긴 형제
	if err != nil {
		t.Fatalf("유예 갱신 실패: %v", err)
	}
	if err := svc.LogOut(ctx, s1.RefreshToken); err != nil {
		t.Fatal(err)
	}
	for name, tok := range map[string]string{"옛": phone.RefreshToken, "형제": s2.RefreshToken, "본인": s1.RefreshToken} {
		if _, _, err := svc.Refresh(ctx, tok); domainCode(t, err) != errs.Unauthorized {
			t.Fatalf("로그아웃 뒤 %s 토큰이 통했다", name)
		}
	}
	if _, _, err := svc.Refresh(ctx, laptop.RefreshToken); err != nil {
		t.Fatalf("다른 기기까지 끊겼다: %v", err)
	}
}

// 비밀번호 재설정(전체 폐기) 뒤에는 방금 회전된 옛 토큰도 유예로 되살아나지 않는다(QA Q4).
func TestResetClosesRotationGrace(t *testing.T) {
	ctx := context.Background()
	svc, _, _, box := newAccountService(t)
	_, first, err := svc.SignUp(ctx, "a@x.com", "password1", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, first.RefreshToken); err != nil { // 회전 → first 는 유예 대상
		t.Fatal(err)
	}
	if err := svc.RequestPasswordReset(ctx, "a@x.com"); err != nil {
		t.Fatal(err)
	}
	if err := svc.ResetPassword(ctx, box.lastToken(t, "비밀번호 재설정"), "newpassword9"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, first.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("비밀번호 재설정 뒤 회전 유예로 옛 기기가 되살아났다")
	}
}
