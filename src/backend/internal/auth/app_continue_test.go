package auth

// SPEC-018 §7  웹 → 앱 로그인 넘기기(CreateAppContinue) — 서비스·핸들러 규칙.

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	authv1 "github.com/JWK-company/liftgram/src/backend/gen/auth/v1"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 가짜 맡김 저장소 — oauth.Handler.PutAppHandoff 와 같은 계약(마지막 맡김을 기억).
type fakeHandoff struct {
	target, challenge string
	n                 int
}

func (f *fakeHandoff) PutAppHandoff(target, challenge string) (string, bool) {
	if !validContinueChallenge(challenge) {
		return "", false
	}
	f.target, f.challenge = target, challenge
	f.n++
	return "hc-" + challenge[:6], true
}

func s256(v string) string {
	sum := sha256.Sum256([]byte(v))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// 맡긴 착지에서 넘기기 코드를 꺼낸다.
func continueCode(t *testing.T, h *fakeHandoff) string {
	t.Helper()
	u, err := url.Parse(h.target)
	if err != nil || u.Path != "/auth/complete" || u.Query().Get("via") != "continue" {
		t.Fatalf("착지 경로가 다르다: %q", h.target)
	}
	return u.Query().Get("code")
}

func socialOnlyUser(t *testing.T, svc *Service, repo *fakeRepo) string {
	t.Helper()
	u, _, err := svc.SignUp(context.Background(), "c@x.com", "password1", "")
	if err != nil {
		t.Fatal(err)
	}
	su := repo.users[u.ID]
	su.PasswordHash = ""
	repo.users[u.ID] = su
	return u.ID
}

func TestAppContinue_앱_스킴_주소와_착지를_맡긴다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	id := socialOnlyUser(t, svc, repo)
	h := &fakeHandoff{}
	ch := s256("verifier-0123456789")
	got, err := svc.CreateAppContinue(ctx, h, id, ch)
	if err != nil {
		t.Fatal(err)
	}
	if got != "liftgram://auth?code="+url.QueryEscape("hc-"+ch[:6]) {
		t.Fatalf("앱 주소: %q", got)
	}
	if h.challenge != ch || continueCode(t, h) == "" {
		t.Fatalf("맡김: %+v", h)
	}
	if appContinueTTL != 60*time.Second {
		t.Fatalf("넘기기 코드 수명 %v(60초여야)", appContinueTTL)
	}
}

func TestAppContinue_challenge_형식과_조립_누락(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	id := socialOnlyUser(t, svc, repo)
	for _, bad := range []string{"", "short", strings.Repeat("a", 42), strings.Repeat("a", 44), strings.Repeat("+", 43), s256("v")[:42] + "="} {
		if _, err := svc.CreateAppContinue(ctx, &fakeHandoff{}, id, bad); codeOf(err) != errs.Validation {
			t.Fatalf("challenge %q 가 통과: %v", bad, err)
		}
	}
	if _, err := svc.CreateAppContinue(ctx, nil, id, s256("v")); codeOf(err) != errs.Unavailable {
		t.Fatalf("맡김 저장소 없이: %v", err)
	}
	if _, err := svc.CreateAppContinue(ctx, &fakeHandoff{}, "없는-사람", s256("v")); codeOf(err) != errs.Unauthorized {
		t.Fatalf("없는 사용자: %v", err)
	}
}

func TestAppContinue_코드는_한번만_그리고_만료(t *testing.T) {
	ctx := context.Background()
	svc, repo, acct, _ := newAccountService(t)
	id := socialOnlyUser(t, svc, repo)
	h := &fakeHandoff{}
	if _, err := svc.CreateAppContinue(ctx, h, id, s256("v1")); err != nil {
		t.Fatal(err)
	}
	code := continueCode(t, h)
	u, tok, created, err := svc.ExchangeLoginCode(ctx, code)
	if err != nil || u.ID != id || tok.RefreshToken == "" || created {
		t.Fatalf("교환: %v created=%v", err, created)
	}
	if _, _, _, err := svc.ExchangeLoginCode(ctx, code); codeOf(err) != errs.Unauthorized {
		t.Fatalf("같은 넘기기 코드가 두 번: %v", err)
	}

	// 61초 지난 코드 — 가짜 저장소의 만료를 앞당긴다(실제 쿼리는 expires_at > now()).
	if _, err := svc.CreateAppContinue(ctx, h, id, s256("v2")); err != nil {
		t.Fatal(err)
	}
	code2 := continueCode(t, h)
	hh := hashToken(code2)
	e := acct.tokens[hh]
	e.exp = time.Now().Add(-time.Second)
	acct.tokens[hh] = e
	if _, _, _, err := svc.ExchangeLoginCode(ctx, code2); codeOf(err) != errs.Unauthorized {
		t.Fatalf("만료된 넘기기 코드가 통과: %v", err)
	}

	// 다시 누르면 옛 코드는 죽는다(마지막 것만)
	if _, err := svc.CreateAppContinue(ctx, h, id, s256("v3")); err != nil {
		t.Fatal(err)
	}
	old := continueCode(t, h)
	if _, err := svc.CreateAppContinue(ctx, h, id, s256("v4")); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := svc.ExchangeLoginCode(ctx, old); err == nil {
		t.Fatal("다시 누른 뒤 옛 넘기기 코드가 통했다")
	}
	if _, _, _, err := svc.ExchangeLoginCode(ctx, continueCode(t, h)); err != nil {
		t.Fatalf("마지막 코드: %v", err)
	}
}

func TestAppContinue_넘겨받은_세션은_최근_로그인이_아니다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	id := socialOnlyUser(t, svc, repo)
	// 가입 때 만든 계열(login)을 오래된 것으로 — 실제로는 몇 시간 전 웹 로그인
	for hsh, tk := range repo.tokens {
		if tk.UserID == id {
			tk.ExpiresAt = tk.ExpiresAt.Add(-2 * time.Hour)
			repo.tokens[hsh] = tk
		}
	}
	h := &fakeHandoff{}
	if _, err := svc.CreateAppContinue(ctx, h, id, s256("v")); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := svc.ExchangeLoginCode(ctx, continueCode(t, h)); err != nil {
		t.Fatal(err)
	}
	var cont int
	for hsh, tk := range repo.tokens {
		if tk.UserID == id && tk.FamilyID == hsh && tk.Origin == OriginContinue {
			cont++
		}
	}
	if cont != 1 {
		t.Fatalf("넘기기 계열 첫 토큰 %d개(1이어야)", cont)
	}
	if err := svc.DeleteAccount(ctx, id, "", DeleteConfirmWord); codeOf(err) != errs.Forbidden {
		t.Fatalf("넘겨받은 세션만으로 계정이 지워졌다: %v", err)
	}
	if _, ok := repo.users[id]; !ok {
		t.Fatal("거절했는데 사용자가 사라졌다")
	}

	// 소셜 로그인 코드로 다시 로그인하면 최근 로그인 — 지울 수 있다
	code, err := svc.IssueLoginCode(ctx, id, false)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := svc.ExchangeLoginCode(ctx, code); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteAccount(ctx, id, "", DeleteConfirmWord); err != nil {
		t.Fatalf("다시 로그인 뒤 삭제 실패: %v", err)
	}
}

func TestAppContinue_비밀번호_변경은_넘겨받은_계열도_끊는다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	u, _, err := svc.SignUp(ctx, "p@x.com", "password1", "")
	if err != nil {
		t.Fatal(err)
	}
	h := &fakeHandoff{}
	if _, err := svc.CreateAppContinue(ctx, h, u.ID, s256("v")); err != nil {
		t.Fatal(err)
	}
	_, tok, _, err := svc.ExchangeLoginCode(ctx, continueCode(t, h))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ChangePassword(ctx, u.ID, "password1", "password2"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, tok.RefreshToken); err == nil {
		t.Fatal("비밀번호를 바꿨는데 넘겨받은 세션이 살아 있다")
	}
	_ = repo
}

func TestAppContinue_핸들러_로그인과_요청_제한(t *testing.T) {
	svc, repo, _, _ := newAccountService(t)
	id := socialOnlyUser(t, svc, repo)
	h := NewHandler(svc).WithAppHandoff(&fakeHandoff{})
	req := func(ip string) *connect.Request[authv1.CreateAppContinueRequest] {
		r := connect.NewRequest(&authv1.CreateAppContinueRequest{Challenge: s256("v")})
		r.Header().Set("X-Forwarded-For", ip)
		return r
	}
	if _, err := h.CreateAppContinue(context.Background(), req("1.1.1.1")); codeOf(err) != errs.Unauthorized {
		t.Fatalf("로그인 없이: %v", err)
	}
	ctx := context.WithValue(context.Background(), userIDKey, id)
	for i := 0; i < appContinuePerMinute; i++ {
		if _, err := h.CreateAppContinue(ctx, req("1.1.1."+string(rune('a'+i)))); err != nil {
			t.Fatalf("%d번째: %v", i+1, err)
		}
	}
	// 같은 사용자 — IP 를 바꿔도 막힌다
	if _, err := h.CreateAppContinue(ctx, req("9.9.9.9")); codeOf(err) != errs.Unavailable {
		t.Fatalf("사용자 제한: %v", err)
	}
	// 같은 IP — 다른 사용자도 막힌다
	h2 := NewHandler(svc).WithAppHandoff(&fakeHandoff{})
	for i := 0; i < appContinuePerMinute; i++ {
		other := context.WithValue(context.Background(), userIDKey, id+string(rune('a'+i)))
		_, _ = h2.CreateAppContinue(other, req("2.2.2.2"))
	}
	if _, err := h2.CreateAppContinue(ctx, req("2.2.2.2")); codeOf(err) != errs.Unavailable {
		t.Fatalf("IP 제한: %v", err)
	}
	if AppContinueScheme != "liftgram" {
		t.Fatal("앱 스킴이 바뀌었다 — oauth.AppScheme 과 같이 고친다")
	}
}
