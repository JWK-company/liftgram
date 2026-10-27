// 정식 계정 규칙 테스트 — DB 없이 account.go 의 판단만 본다 (SRS-052)
//
// 확인 목록:
//   - 확인 메일 링크는 한 번만 통하고, 그 사이 주소가 바뀌었으면 통하지 않는다
//   - 비밀번호 찾기는 있는 주소·없는 주소에 같은 답을 하고, 소셜 전용이면 안내 메일만 간다
//   - 재설정하면 모든 세션이 끊기고 새 비밀번호로만 로그인된다
//   - 소셜은 같은 주소의 계정과 **자동으로 합치지 않는다** · 연결은 로그인한 사람만
//   - 마지막 로그인 수단은 해제할 수 없다
//   - 일회용 로그인 코드는 한 번만 세션이 된다
package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/mailer"
)

// ── 가짜 저장소·메일 ────────────────────────────────────────────────────────

type fakeAcct struct {
	base   *fakeRepo
	tokens map[string]struct {
		AuthToken
		purpose string
		exp     time.Time
		used    bool
		at      time.Time
	}
	ids []Identity
}

func newFakeAcct(base *fakeRepo) *fakeAcct {
	return &fakeAcct{base: base, tokens: map[string]struct {
		AuthToken
		purpose string
		exp     time.Time
		used    bool
		at      time.Time
	}{}}
}

func (f *fakeAcct) SetEmailVerified(_ context.Context, id string) error {
	u := f.base.users[id]
	u.EmailVerified = true
	f.base.users[id] = u
	return nil
}
func (f *fakeAcct) SetPasswordHash(_ context.Context, id, hash string) error {
	u := f.base.users[id]
	u.PasswordHash = hash
	f.base.users[id] = u
	return nil
}
func (f *fakeAcct) RevokeAllRefreshTokens(_ context.Context, id string) error {
	// 실제 쿼리와 같은 의미 — 이미 회전으로 폐기된 행의 사유도 'all'로 덮어써 유예를 닫는다(SRS-083 Q4).
	now := f.base.now()
	for h, t := range f.base.tokens {
		if t.UserID == id {
			if t.RevokedAt == nil {
				t.RevokedAt = &now
			}
			t.RevokeReason = "all"
			f.base.tokens[h] = t
			f.base.revoked[h] = true
		}
	}
	return nil
}
func (f *fakeAcct) CreateAuthToken(_ context.Context, hash, uid, purpose, email string, exp time.Time) error {
	f.tokens[hash] = struct {
		AuthToken
		purpose string
		exp     time.Time
		used    bool
		at      time.Time
	}{AuthToken{UserID: uid, Email: email}, purpose, exp, false, time.Now()}
	return nil
}
func (f *fakeAcct) ConsumeAuthToken(_ context.Context, hash, purpose string) (AuthToken, error) {
	t, ok := f.tokens[hash]
	if !ok || t.used || t.purpose != purpose || t.exp.Before(time.Now()) {
		return AuthToken{}, errs.New(errs.NotFound, "토큰 없음")
	}
	t.used = true
	f.tokens[hash] = t
	return t.AuthToken, nil
}
func (f *fakeAcct) LastAuthTokenAt(_ context.Context, uid, purpose string) (time.Time, error) {
	var last time.Time
	for _, t := range f.tokens {
		if t.UserID == uid && t.purpose == purpose && t.at.After(last) {
			last = t.at
		}
	}
	return last, nil
}
func (f *fakeAcct) InvalidateAuthTokens(_ context.Context, uid, purpose string) error {
	for h, t := range f.tokens {
		if t.UserID == uid && t.purpose == purpose {
			t.used = true
			f.tokens[h] = t
		}
	}
	return nil
}
func (f *fakeAcct) GetIdentity(_ context.Context, p, pid string) (Identity, error) {
	for _, i := range f.ids {
		if i.Provider == p && i.ProviderUserID == pid {
			return i, nil
		}
	}
	return Identity{}, errs.New(errs.NotFound, "없음")
}
func (f *fakeAcct) CreateIdentity(_ context.Context, uid, p, pid, email string) error {
	f.ids = append(f.ids, Identity{UserID: uid, Provider: p, ProviderUserID: pid, Email: email})
	return nil
}
func (f *fakeAcct) ListIdentities(_ context.Context, uid string) ([]Identity, error) {
	var out []Identity
	for _, i := range f.ids {
		if i.UserID == uid {
			out = append(out, i)
		}
	}
	return out, nil
}
func (f *fakeAcct) DeleteIdentity(_ context.Context, uid, p string) (int64, error) {
	var kept []Identity
	var n int64
	for _, i := range f.ids {
		if i.UserID == uid && i.Provider == p {
			n++
			continue
		}
		kept = append(kept, i)
	}
	f.ids = kept
	return n, nil
}

// 보낸 메일을 모은다 — 링크 속 토큰을 꺼내 "메일을 연 사람"을 흉내 낸다.
type mailbox struct {
	mu   sync.Mutex
	sent []mailer.Mail
}

func (m *mailbox) Send(_ context.Context, mail mailer.Mail) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, mail)
	return nil
}

// 비동기 발송을 기다렸다가 마지막 메일의 token= 값을 꺼낸다.
func (m *mailbox) lastToken(t *testing.T, subject string) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		m.mu.Lock()
		for i := len(m.sent) - 1; i >= 0; i-- {
			if strings.Contains(m.sent[i].Subject, subject) {
				body := m.sent[i].TextBody
				m.mu.Unlock()
				i := strings.Index(body, "token=")
				if i < 0 {
					t.Fatalf("메일에 토큰이 없다: %s", body)
				}
				rest := body[i+len("token="):]
				return strings.Fields(rest)[0]
			}
		}
		m.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("%q 메일이 오지 않았다", subject)
	return ""
}

func (m *mailbox) count(subject string) int {
	time.Sleep(50 * time.Millisecond)
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, s := range m.sent {
		if strings.Contains(s.Subject, subject) {
			n++
		}
	}
	return n
}

func newAccountService(t *testing.T) (*Service, *fakeRepo, *fakeAcct, *mailbox) {
	t.Helper()
	svc, repo := newTestService()
	acct := newFakeAcct(repo)
	box := &mailbox{}
	tmpl, err := mailer.NewTemplates("https://liftgram.test")
	if err != nil {
		t.Fatal(err)
	}
	svc.WithAccount(Account{Repo: acct, Mail: box, Templates: tmpl})
	return svc, repo, acct, box
}

func codeOf(err error) errs.Code {
	var de *errs.DomainError
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

func TestVerifyEmail_한번만_통한다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, box := newAccountService(t)
	u, _, err := svc.SignUp(ctx, "a@x.com", "password1", "")
	if err != nil {
		t.Fatal(err)
	}
	tok := box.lastToken(t, "이메일 주소를 확인")
	if err := svc.VerifyEmail(ctx, tok); err != nil {
		t.Fatalf("첫 확인이 실패: %v", err)
	}
	if !repo.users[u.ID].EmailVerified {
		t.Fatal("확인 뒤에도 미확인 상태")
	}
	if err := svc.VerifyEmail(ctx, tok); codeOf(err) != errs.Validation {
		t.Fatalf("같은 링크가 두 번 통했다: %v", err)
	}
}

func TestVerifyEmail_주소가_바뀌면_옛_링크는_무효(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, box := newAccountService(t)
	u, _, _ := svc.SignUp(ctx, "a@x.com", "password1", "")
	tok := box.lastToken(t, "이메일 주소를 확인")
	changed := repo.users[u.ID]
	changed.Email = "b@x.com"
	repo.users[u.ID] = changed
	if err := svc.VerifyEmail(ctx, tok); err == nil {
		t.Fatal("다른 주소를 옛 링크로 확인했다")
	}
}

func TestRequestPasswordReset_없는_주소와_같은_답(t *testing.T) {
	ctx := context.Background()
	svc, _, _, box := newAccountService(t)
	if err := svc.RequestPasswordReset(ctx, "nobody@x.com"); err != nil {
		t.Fatalf("없는 주소에 오류로 답했다(계정 존재가 샌다): %v", err)
	}
	if box.count("비밀번호 재설정") != 0 {
		t.Fatal("없는 주소에 메일을 보냈다")
	}
}

func TestResetPassword_세션을_끊고_새_비밀번호로만(t *testing.T) {
	ctx := context.Background()
	svc, _, _, box := newAccountService(t)
	_, tokens, _ := svc.SignUp(ctx, "a@x.com", "password1", "")
	if err := svc.RequestPasswordReset(ctx, "A@x.com "); err != nil {
		t.Fatal(err)
	}
	tok := box.lastToken(t, "비밀번호 재설정")
	if err := svc.ResetPassword(ctx, tok, "newpassword9"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, tokens.RefreshToken); err == nil {
		t.Fatal("재설정 뒤에도 옛 세션이 살아 있다")
	}
	if _, _, err := svc.LogIn(ctx, "a@x.com", "password1"); err == nil {
		t.Fatal("옛 비밀번호로 로그인됐다")
	}
	if _, _, err := svc.LogIn(ctx, "a@x.com", "newpassword9"); err != nil {
		t.Fatalf("새 비밀번호로 로그인 실패: %v", err)
	}
	if err := svc.ResetPassword(ctx, tok, "another99"); err == nil {
		t.Fatal("같은 재설정 링크가 두 번 통했다")
	}
}

func TestChangePassword_현재_비밀번호를_확인한다(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _ := newAccountService(t)
	u, _, _ := svc.SignUp(ctx, "a@x.com", "password1", "")
	if _, err := svc.ChangePassword(ctx, u.ID, "wrong-one", "newpassword9"); codeOf(err) != errs.Validation {
		t.Fatalf("틀린 현재 비밀번호로 바꿨다: %v", err)
	}
	if _, err := svc.ChangePassword(ctx, u.ID, "password1", "newpassword9"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.LogIn(ctx, "a@x.com", "newpassword9"); err != nil {
		t.Fatalf("바꾼 비밀번호로 로그인 실패: %v", err)
	}
}

func TestSocial_같은_주소의_계정과_자동으로_합치지_않는다(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _ := newAccountService(t)
	if _, _, err := svc.SignUp(ctx, "a@x.com", "password1", ""); err != nil {
		t.Fatal(err)
	}
	_, _, err := svc.SocialSignIn(ctx, SocialProfile{Provider: "google", ProviderUserID: "g1", Email: "A@x.com", EmailVerified: true}, "")
	if !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("같은 주소의 계정에 자동으로 들어갔다: %v", err)
	}
}

func TestSocial_새_계정_다음엔_같은_계정으로(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	p := SocialProfile{Provider: "google", ProviderUserID: "g1", Email: "new@x.com", EmailVerified: true, DisplayName: "새사람"}
	id1, created, err := svc.SocialSignIn(ctx, p, "")
	if err != nil || !created {
		t.Fatalf("새 계정이 안 만들어졌다: %v %v", created, err)
	}
	if !repo.users[id1].EmailVerified || repo.users[id1].PasswordHash != "" {
		t.Fatal("보증된 주소인데 미확인이거나, 소셜 전용인데 비밀번호가 있다")
	}
	// 제공자 쪽 주소가 바뀌어도 앵커(제공자 ID)로 같은 사람이다.
	p.Email = "changed@x.com"
	id2, created, err := svc.SocialSignIn(ctx, p, "")
	if err != nil || created || id2 != id1 {
		t.Fatalf("같은 제공자 ID가 다른 계정이 됐다: %s %s %v", id1, id2, err)
	}
}

func TestSocial_보증되지_않은_주소는_저장하지_않는다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	id, _, err := svc.SocialSignIn(ctx, SocialProfile{Provider: "naver", ProviderUserID: "n1", Email: "maybe@x.com"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if repo.users[id].Email != "" {
		t.Fatal("보증되지 않은 주소를 계정 주소로 저장했다(남의 주소일 수 있다)")
	}
}

func TestSocial_연결_그리고_남의_연결은_거절(t *testing.T) {
	ctx := context.Background()
	svc, _, _, box := newAccountService(t)
	me, _, _ := svc.SignUp(ctx, "me@x.com", "password1", "")
	other, _, _ := svc.SignUp(ctx, "other@x.com", "password1", "")
	p := SocialProfile{Provider: "google", ProviderUserID: "g9", Email: "me@gmail.com", EmailVerified: true}
	id, _, err := svc.SocialSignIn(ctx, p, me.ID)
	if err != nil || id != me.ID {
		t.Fatalf("연결 실패: %v", err)
	}
	if box.count("새 로그인 수단") == 0 {
		t.Fatal("연결 알림 메일이 없다")
	}
	if _, _, err := svc.SocialSignIn(ctx, p, other.ID); !errors.Is(err, ErrIdentityTaken) {
		t.Fatalf("남의 계정에 붙은 수단을 또 연결했다: %v", err)
	}
}

func TestUnlink_마지막_수단은_못_푼다(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _ := newAccountService(t)
	id, _, _ := svc.SocialSignIn(ctx, SocialProfile{Provider: "google", ProviderUserID: "g1", Email: "s@x.com", EmailVerified: true}, "")
	if err := svc.UnlinkIdentity(ctx, id, "google"); codeOf(err) != errs.Validation {
		t.Fatalf("마지막 로그인 수단이 풀렸다: %v", err)
	}
	if _, err := svc.ChangePassword(ctx, id, "", "password9"); err != nil {
		t.Fatalf("소셜 전용 계정의 비밀번호 설정 실패: %v", err)
	}
	if err := svc.UnlinkIdentity(ctx, id, "google"); err != nil {
		t.Fatalf("비밀번호가 생긴 뒤에도 못 푼다: %v", err)
	}
}

func TestLoginCode_한번만_세션이_된다(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _ := newAccountService(t)
	id, created, _ := svc.SocialSignIn(ctx, SocialProfile{Provider: "google", ProviderUserID: "g1", Email: "s@x.com", EmailVerified: true}, "")
	code, err := svc.IssueLoginCode(ctx, id, created)
	if err != nil {
		t.Fatal(err)
	}
	u, tok, wasCreated, err := svc.ExchangeLoginCode(ctx, code)
	if err != nil || u.ID != id || tok.AccessToken == "" || !wasCreated {
		t.Fatalf("코드 교환 실패: %v", err)
	}
	if _, _, _, err := svc.ExchangeLoginCode(ctx, code); err == nil {
		t.Fatal("같은 코드가 두 번 세션이 됐다")
	}
}
