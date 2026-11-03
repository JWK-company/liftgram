// @plm SRS-052  정식 계정 규칙 — 소유 확인 · 비밀번호 재설정/변경 · 소셜 로그인 · 일회용 로그인 코드
//
// ─────────────────────────────────────────────────────────────────────────────
// booktarae.org 가 운영 중인 규칙을 liftgram 의 계정 모델(users 에 bcrypt 해시)에 맞춰 들였다.
//
// ── 지키는 규칙 ─────────────────────────────────────────────────────────────
// ① **응답으로 계정 존재를 드러내지 않는다.** 비밀번호 찾기는 있든 없든 같은 답이고, 소셜 전용 계정이라는
//
//	안내는 **메일로만** 간다(메일은 그 주소의 주인만 읽는다).
//
// ② **토큰은 해시로만 저장하고 한 번만 쓴다.** 소모는 저장소의 한 문장(UPDATE … RETURNING)이 해서
//
//	동시에 두 번 눌러도 한 번만 성공한다. 새로 발급하면 같은 목적의 옛 토큰은 죽인다.
//
// ③ **비밀번호를 재설정하면 모든 세션을 끊는다.** 탈취당한 사람이 되찾는 경로이기 때문이다.
// ④ **소셜 계정은 이메일로 자동 합치지 않는다.** 같은 주소의 계정이 이미 있으면, 그 계정으로 로그인한 뒤
//
//	연결하게 한다 — 제공자 쪽 주소를 바꿔 남의 계정에 들어가는 길을 막는다. 앵커는 (제공자, 제공자 ID)다.
//
// ⑤ **메일 발송 실패는 요청을 실패시키지 않는다**(토큰은 이미 DB에 있고 재발송이 복구 경로다).
//
//	대신 실패를 로그에 크게 남긴다 — "보냈다"고 조용히 넘어가지 않는다.
//
// ─────────────────────────────────────────────────────────────────────────────
package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/mailer"
)

const (
	verifyTTL      = 24 * time.Hour
	resetTTL       = 30 * time.Minute
	loginCodeTTL   = 60 * time.Second
	linkTicketTTL  = 2 * time.Minute
	resendCooldown = 60 * time.Second
	mailTimeout    = 15 * time.Second
)

// Account는 정식 계정 기능에 필요한 것들이다. 조립 지점이 WithAccount로 끼운다.
// 비어 있으면(테스트·옛 조립) 가입은 지금처럼 메일 없이 동작한다.
type Account struct {
	Repo AccountRepo
	// @plm SRS-095  계정 삭제가 커밋된 뒤 — 사진 저장소 바이트를 지운다(조립부가 media 저장소를 잇는다). nil 이면 건너뜀.
	OnAccountDeleted func(userID string, mediaKeys []string)
	Mail             mailer.Sender
	Templates        *mailer.Templates
	Human            *Turnstile // nil 이면 사람 확인을 하지 않는다(키 없음)
	// 켜진 소셜 제공자(화면이 버튼을 그릴 근거)
	Providers []string
	// 메일이 실제로 나가는가(smtp). console 이면 false — 화면이 확인 안내를 숨긴다
	MailEnabled bool
	// @plm SRS-095  iOS 앱 Apple 네이티브 로그인이 켜졌는가(GetAuthOptions 로 화면에 알린다)
	AppleNative bool
}

// WithAccount — 정식 계정 기능을 켠다.
func (s *Service) WithAccount(a Account) *Service {
	s.acct = &a
	return s
}

func (s *Service) account() (*Account, error) {
	if s.acct == nil || s.acct.Repo == nil {
		return nil, errs.New(errs.Unavailable, "계정 기능이 설정되지 않았습니다")
	}
	return s.acct, nil
}

// Providers — 켜진 소셜 제공자 목록.
func (s *Service) Providers() []string {
	if s.acct == nil {
		return nil
	}
	return s.acct.Providers
}

// AppleNative — iOS 앱 「Apple로 계속」이 서버에서 켜졌는가. @plm SRS-095
func (s *Service) AppleNative() bool { return s.acct != nil && s.acct.AppleNative }

// MailEnabled — 계정 메일이 실제로 나가는가.
func (s *Service) MailEnabled() bool {
	return s.acct != nil && s.acct.MailEnabled
}

// CheckHuman — 로그인 없이 메일을 내보내는 입구(가입·비밀번호 찾기)에서 부른다.
func (s *Service) CheckHuman(ctx context.Context, token, ip string) error {
	if s.acct == nil {
		return nil
	}
	if err := s.acct.Human.Verify(ctx, token, ip); err != nil {
		return errs.New(errs.Validation, "보안 확인을 다시 해 주세요")
	}
	return nil
}

func (s *Service) send(m mailer.Mail) {
	if s.acct == nil || s.acct.Mail == nil {
		return
	}
	mailer.SendAsync(s.acct.Mail, m, mailTimeout)
}

// newOneTime — 일회용 토큰을 만들어 저장하고 원문을 돌려준다. 같은 목적의 옛 토큰은 죽인다.
func (s *Service) newOneTime(ctx context.Context, a *Account, userID, purpose, email string, ttl time.Duration) (string, error) {
	raw, err := newRefreshToken()
	if err != nil {
		return "", err
	}
	if err := a.Repo.InvalidateAuthTokens(ctx, userID, purpose); err != nil {
		return "", err
	}
	if err := a.Repo.CreateAuthToken(ctx, hashToken(raw), userID, purpose, email, s.now().Add(ttl)); err != nil {
		return "", err
	}
	return raw, nil
}

// ── 이메일 소유 확인 ────────────────────────────────────────────────────────

// sendVerification — 가입 직후·재발송에서 부른다. 남은 대기 초를 돌려준다(0이면 보냈다).
func (s *Service) sendVerification(ctx context.Context, u User, force bool) (int32, error) {
	a, err := s.account()
	if err != nil || u.Email == "" || u.EmailVerified {
		return 0, err
	}
	if !force {
		last, err := a.Repo.LastAuthTokenAt(ctx, u.ID, PurposeVerifyEmail)
		if err != nil {
			return 0, err
		}
		if wait := resendCooldown - s.now().Sub(last); wait > 0 {
			return int32(wait.Seconds()) + 1, nil
		}
	}
	raw, err := s.newOneTime(ctx, a, u.ID, PurposeVerifyEmail, u.Email, verifyTTL)
	if err != nil {
		return 0, err
	}
	if a.Templates != nil {
		s.send(a.Templates.Verify(u.Email, raw))
	}
	return 0, nil
}

// SendEmailVerification — 로그인한 사람이 확인 메일을 다시 받는다.
func (s *Service) SendEmailVerification(ctx context.Context, userID string) (int32, error) {
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return 0, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.sendVerification(ctx, u, false)
}

// VerifyEmail — 메일의 링크. 토큰이 발급될 때의 주소와 지금 주소가 같아야 한다(그 사이 바뀌었으면 무효).
func (s *Service) VerifyEmail(ctx context.Context, raw string) error {
	a, err := s.account()
	if err != nil {
		return err
	}
	t, err := a.Repo.ConsumeAuthToken(ctx, hashToken(raw), PurposeVerifyEmail)
	if err != nil {
		return errs.New(errs.Validation, "링크가 만료되었거나 이미 사용되었습니다")
	}
	u, err := s.repo.GetUserByID(ctx, t.UserID)
	if err != nil || normalizeEmail(u.Email) != normalizeEmail(t.Email) {
		return errs.New(errs.Validation, "링크가 만료되었거나 이미 사용되었습니다")
	}
	return a.Repo.SetEmailVerified(ctx, u.ID)
}

// ── 비밀번호 ────────────────────────────────────────────────────────────────

// RequestPasswordReset — 있든 없든 같은 답(nil). 소셜 전용이면 어느 제공자로 가입했는지 메일로 알린다.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	a, err := s.account()
	if err != nil {
		return err
	}
	u, err := s.repo.GetUserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		return nil // 없는 주소 — 같은 답
	}
	if u.PasswordHash == "" {
		ids, _ := a.Repo.ListIdentities(ctx, u.ID)
		label := "소셜"
		if len(ids) > 0 {
			label = ProviderLabel(ids[0].Provider)
		}
		if a.Templates != nil {
			s.send(a.Templates.SocialOnly(u.Email, label))
		}
		return nil
	}
	last, err := a.Repo.LastAuthTokenAt(ctx, u.ID, PurposeResetPassword)
	if err == nil && s.now().Sub(last) < resendCooldown {
		return nil // 연타 — 조용히 무시(같은 답)
	}
	raw, err := s.newOneTime(ctx, a, u.ID, PurposeResetPassword, u.Email, resetTTL)
	if err != nil {
		return err
	}
	if a.Templates != nil {
		s.send(a.Templates.PasswordReset(u.Email, raw))
	}
	return nil
}

// ResetPassword — 메일의 링크로 새 비밀번호. 모든 세션을 끊고, 주소 소유도 확인된 것으로 본다.
func (s *Service) ResetPassword(ctx context.Context, raw, newPassword string) error {
	a, err := s.account()
	if err != nil {
		return err
	}
	if len(newPassword) < 8 {
		return errs.New(errs.Validation, "비밀번호는 8자 이상이어야 합니다")
	}
	t, err := a.Repo.ConsumeAuthToken(ctx, hashToken(raw), PurposeResetPassword)
	if err != nil {
		return errs.New(errs.Validation, "링크가 만료되었거나 이미 사용되었습니다")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return err
	}
	if err := a.Repo.SetPasswordHash(ctx, t.UserID, string(hash)); err != nil {
		return err
	}
	if err := a.Repo.RevokeAllRefreshTokens(ctx, t.UserID); err != nil {
		return err
	}
	// 메일을 받아 링크를 눌렀다 = 그 주소의 주인이다.
	_ = a.Repo.SetEmailVerified(ctx, t.UserID)
	if u, err := s.repo.GetUserByID(ctx, t.UserID); err == nil && a.Templates != nil {
		s.send(a.Templates.PasswordChanged(u.Email))
	}
	return nil
}

// ChangePassword — 로그인한 상태에서. 비밀번호가 있으면 현재 비밀번호를 확인하고, 없으면(소셜 전용) 설정한다.
// 다른 기기의 세션은 끊고 이 기기에는 새 토큰을 준다.
func (s *Service) ChangePassword(ctx context.Context, userID, current, newPassword string) (Tokens, error) {
	a, err := s.account()
	if err != nil {
		return Tokens{}, err
	}
	if len(newPassword) < 8 {
		return Tokens{}, errs.New(errs.Validation, "비밀번호는 8자 이상이어야 합니다")
	}
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return Tokens{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if u.PasswordHash != "" {
		if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(current)) != nil {
			return Tokens{}, errs.New(errs.Validation, "현재 비밀번호가 올바르지 않습니다")
		}
	} else if err := s.requireRecentLogin(ctx, a, u.ID); err != nil {
		// @plm SRS-095  소셜 전용의 첫 비밀번호 설정도 최근 로그인 — 아니면 access token 만으로 비밀번호를 만들고
		// 그 비밀번호로 계정 삭제 재인증을 넘는다(qa 재확인 H-1).
		return Tokens{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return Tokens{}, err
	}
	if err := a.Repo.SetPasswordHash(ctx, u.ID, string(hash)); err != nil {
		return Tokens{}, err
	}
	if err := a.Repo.RevokeAllRefreshTokens(ctx, u.ID); err != nil {
		return Tokens{}, err
	}
	if a.Templates != nil && u.Email != "" {
		s.send(a.Templates.PasswordChanged(u.Email))
	}
	return s.issue(ctx, u)
}

// ── 소셜 ────────────────────────────────────────────────────────────────────

// SocialProfile — 제공자에게서 받은 것(oauth 패키지가 채운다).
type SocialProfile struct {
	Provider       string
	ProviderUserID string
	Email          string
	EmailVerified  bool
	DisplayName    string
}

// 소셜 판정 결과.
var (
	// ErrEmailTaken — 같은 주소의 계정이 이미 있다. 그 계정으로 로그인한 뒤 연결하게 한다.
	ErrEmailTaken = errors.New("이미 가입된 이메일입니다")
	// ErrIdentityTaken — 이 소셜 계정은 이미 다른 사람 계정에 연결돼 있다(연결 시도에서).
	ErrIdentityTaken = errors.New("이미 다른 계정에 연결된 로그인 수단입니다")
)

// SocialSignIn — 소셜 로그인·가입·연결 판정. 로그인할 사용자 id와 새로 만들었는지를 돌려준다.
//
//	linkUserID 가 있으면 **연결**이다(로그인한 사람이 연결 표를 들고 나갔다).
func (s *Service) SocialSignIn(ctx context.Context, p SocialProfile, linkUserID string) (userID string, created bool, err error) {
	a, err := s.account()
	if err != nil {
		return "", false, err
	}
	p.Email = normalizeEmail(p.Email)

	ident, err := a.Repo.GetIdentity(ctx, p.Provider, p.ProviderUserID)
	if err == nil {
		if linkUserID != "" && ident.UserID != linkUserID {
			return "", false, ErrIdentityTaken
		}
		return ident.UserID, false, nil
	}
	if !isNotFound(err) {
		return "", false, err
	}

	// 연결 — 로그인한 사람의 계정에 붙인다.
	if linkUserID != "" {
		u, err := s.repo.GetUserByID(ctx, linkUserID)
		if err != nil {
			return "", false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
		}
		if err := a.Repo.CreateIdentity(ctx, u.ID, p.Provider, p.ProviderUserID, p.Email); err != nil {
			return "", false, err
		}
		if a.Templates != nil && u.Email != "" {
			s.send(a.Templates.IdentityLinked(u.Email, ProviderLabel(p.Provider)))
		}
		return u.ID, false, nil
	}

	// 같은 주소의 계정이 있으면 자동으로 합치지 않는다(규칙 ④).
	if p.Email != "" {
		if _, err := s.repo.GetUserByEmail(ctx, p.Email); err == nil {
			return "", false, ErrEmailTaken
		}
	}

	// 새 계정. 제공자가 보증하지 않은 주소(네이버 등)는 저장하지 않는다 — 남의 주소일 수 있다.
	email := ""
	if p.EmailVerified {
		email = p.Email
	}
	name := strings.TrimSpace(p.DisplayName)
	if r := []rune(name); len(r) > 40 {
		name = string(r[:40])
	}
	u, err := s.repo.CreateUser(ctx, User{
		ID: uuid.NewString(), Email: email, DisplayName: name, AuthProvider: p.Provider, Role: "user",
	})
	if err != nil {
		return "", false, err
	}
	if err := a.Repo.CreateIdentity(ctx, u.ID, p.Provider, p.ProviderUserID, p.Email); err != nil {
		return "", false, err
	}
	if email != "" {
		_ = a.Repo.SetEmailVerified(ctx, u.ID)
	}
	return u.ID, true, nil
}

// IssueLoginCode — 소셜 콜백이 화면에 붙여 보낼 일회용 코드. created 는 코드 안에 싣지 않고 따로 표시한다.
func (s *Service) IssueLoginCode(ctx context.Context, userID string, created bool) (string, error) {
	a, err := s.account()
	if err != nil {
		return "", err
	}
	marker := ""
	if created {
		marker = "created"
	}
	// email 칸에 표시를 싣는다 — 이 목적의 토큰은 주소가 필요 없다.
	return s.newOneTimeKeep(ctx, a, userID, PurposeLoginCode, marker, loginCodeTTL)
}

// 로그인 코드는 여러 탭에서 동시에 소셜 로그인할 수 있어 옛 것을 죽이지 않는다.
func (s *Service) newOneTimeKeep(ctx context.Context, a *Account, userID, purpose, email string, ttl time.Duration) (string, error) {
	raw, err := newRefreshToken()
	if err != nil {
		return "", err
	}
	if err := a.Repo.CreateAuthToken(ctx, hashToken(raw), userID, purpose, email, s.now().Add(ttl)); err != nil {
		return "", err
	}
	return raw, nil
}

// ExchangeLoginCode — 일회용 코드를 세션으로.
// [개선] SPEC-018 §7 — 로그인 코드가 아니면 웹 → 앱 넘기기 코드(PurposeAppContinue)로 한 번 더 본다.
// 넘기기로 시작한 계열은 origin=continue — 「최근 로그인」이 아니다(계정 삭제·첫 비밀번호 설정은 다시 로그인).
func (s *Service) ExchangeLoginCode(ctx context.Context, code string) (User, Tokens, bool, error) {
	a, err := s.account()
	if err != nil {
		return User{}, Tokens{}, false, err
	}
	origin := ""
	t, err := a.Repo.ConsumeAuthToken(ctx, hashToken(code), PurposeLoginCode)
	// [원본] if err != nil { — DB 장애도 두 번째 소모를 시도해 「로그인 시간이 지났습니다」로 보였다(REV-012 백엔드 L-1)
	if isNotFound(err) {
		t, err = a.Repo.ConsumeAuthToken(ctx, hashToken(code), PurposeAppContinue)
		origin = OriginContinue
	}
	if err != nil {
		return User{}, Tokens{}, false, errs.New(errs.Unauthorized, "로그인 시간이 지났습니다. 다시 시도해 주세요")
	}
	u, err := s.repo.GetUserByID(ctx, t.UserID)
	if err != nil {
		return User{}, Tokens{}, false, errs.New(errs.Unauthorized, "로그인 시간이 지났습니다. 다시 시도해 주세요")
	}
	// [원본] tokens, err := s.issue(ctx, u)
	tokens, err := s.issueOrigin(ctx, u, origin)
	return u, tokens, origin == "" && t.Email == "created", err
}

// AppHandoff — 착지 경로를 앱 교환 저장소에 맡기고 교환 코드를 받는다(oauth.Handler 가 구현 · auth 는 oauth 를 모른다).
type AppHandoff interface {
	PutAppHandoff(target, challenge string) (code string, ok bool)
}

// CreateAppContinue — SPEC-018 §7  로그인한 웹(크롬 탭)이 「이 계정으로 앱에 로그인」을 눌렀을 때.
// 일회용 넘기기 코드(60초)를 만들고, 착지 /auth/complete?code=…&via=continue 를 challenge 와 함께 맡긴다.
// 돌려주는 값은 앱 스킴 주소 — v 를 가진 앱 웹뷰만 교환할 수 있다(handoff take).
func (s *Service) CreateAppContinue(ctx context.Context, h AppHandoff, userID, challenge string) (string, error) {
	a, err := s.account()
	if err != nil {
		return "", err
	}
	if h == nil {
		return "", errs.New(errs.Unavailable, "앱 로그인 넘기기를 쓸 수 없습니다")
	}
	if !validContinueChallenge(challenge) {
		return "", errs.New(errs.Validation, "challenge 형식이 맞지 않습니다")
	}
	if _, err := s.repo.GetUserByID(ctx, userID); err != nil {
		return "", errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	// 같은 사람이 여러 번 눌러도 마지막 것만 살린다(옛 넘기기 코드는 죽인다).
	code, err := s.newOneTime(ctx, a, userID, PurposeAppContinue, "", appContinueTTL)
	if err != nil {
		return "", err
	}
	hc, ok := h.PutAppHandoff("/auth/complete?code="+url.QueryEscape(code)+"&via=continue", challenge)
	if !ok {
		return "", errs.New(errs.Validation, "challenge 형식이 맞지 않습니다")
	}
	return AppContinueScheme + "://auth?code=" + url.QueryEscape(hc), nil
}

// AppContinueScheme — 앱 껍데기 스킴(oauth.AppScheme 과 같은 값 · import 방향 때문에 따로 둔다 — 시험이 같은지 본다).
const AppContinueScheme = "liftgram"

// appContinueTTL — 넘기기 코드 수명(로그인 코드와 같다).
const appContinueTTL = loginCodeTTL

// challenge = base64url(sha256(v)) 43자(oauth.validChallenge 와 같은 규칙).
var reContinueChallenge = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func validContinueChallenge(c string) bool { return reContinueChallenge.MatchString(c) }

// CreateLinkTicket — 로그인한 사람이 소셜 연결을 시작할 때.
func (s *Service) CreateLinkTicket(ctx context.Context, userID string) (string, error) {
	a, err := s.account()
	if err != nil {
		return "", err
	}
	return s.newOneTime(ctx, a, userID, PurposeLinkTicket, "", linkTicketTTL)
}

// ConsumeLinkTicket — 연결 시작 지점(oauth start)이 표를 확인한다.
func (s *Service) ConsumeLinkTicket(ctx context.Context, ticket string) (string, error) {
	a, err := s.account()
	if err != nil {
		return "", err
	}
	t, err := a.Repo.ConsumeAuthToken(ctx, hashToken(ticket), PurposeLinkTicket)
	if err != nil {
		return "", errs.New(errs.Unauthorized, "연결 시간이 지났습니다")
	}
	return t.UserID, nil
}

// ListIdentities — 연결된 소셜 로그인 수단.
func (s *Service) ListIdentities(ctx context.Context, userID string) ([]Identity, error) {
	a, err := s.account()
	if err != nil {
		return nil, err
	}
	return a.Repo.ListIdentities(ctx, userID)
}

// UnlinkIdentity — 마지막 로그인 수단은 해제할 수 없다.
func (s *Service) UnlinkIdentity(ctx context.Context, userID, provider string) error {
	a, err := s.account()
	if err != nil {
		return err
	}
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	ids, err := a.Repo.ListIdentities(ctx, userID)
	if err != nil {
		return err
	}
	if u.PasswordHash == "" && len(ids) <= 1 {
		return errs.New(errs.Validation, "마지막 로그인 수단은 해제할 수 없어요. 먼저 비밀번호를 설정해 주세요")
	}
	n, err := a.Repo.DeleteIdentity(ctx, userID, provider)
	if err != nil {
		return err
	}
	if n == 0 {
		return errs.New(errs.NotFound, "연결되지 않은 로그인 수단입니다")
	}
	return nil
}

func isNotFound(err error) bool {
	var de *errs.DomainError
	return errors.As(err, &de) && de.Code == errs.NotFound
}

// ProviderLabel — 메일·화면에 쓸 이름.
func ProviderLabel(p string) string {
	switch p {
	case "google":
		return "구글"
	case "kakao":
		return "카카오"
	case "naver":
		return "네이버"
	}
	return p
}

// LogMailMode — 부팅 때 한 번. 메일이 꺼져 있으면 가입 확인·재설정이 안 된다는 사실을 크게 남긴다.
func LogMailMode(transport string) {
	if transport == "console" {
		slog.Warn("[auth] 메일이 콘솔로만 나간다(MAIL_TRANSPORT=console) — 운영이면 가입 확인·비밀번호 재설정이 사용자에게 닿지 않는다")
	}
}

// ── 계정 삭제 ──────────────────────────────────────────────────────────────────
// @plm SRS-095  스토어 필수(구글 플레이·App Store 5.1.1(v)) · 즉시 · 되돌릴 수 없다.
//
// 다시 확인: 비밀번호가 있는 계정은 비밀번호. 소셜 전용 계정은 **최근 10분 안에 다시 로그인**했어야 한다
// (같이 쓰는 기기·새어 나간 토큰만으로 지우지 못하게 · qa code H-2). 로그인 = 새 세션 계열 시작(LastLoginAt).
// 확인 문구는 화면에서 사람이 직접 친 「삭제」 또는 「DELETE」(해외 심사 · qa code M-7) — 버튼 한 번 실수로 지워지지 않게.
// 사진: 행이 지워지면 /media/file 이 즉시 404 를 내고(Serve 가 행을 본다), 커밋 뒤 OnAccountDeleted 가 저장소 바이트를 지운다.
const DeleteConfirmWord = "삭제"

// DeleteConfirmWordEN — 영어 화면·해외 심사관용 같은 뜻의 확인 문구.
const DeleteConfirmWordEN = "DELETE"

// ReauthWindow — 소셜 전용 계정 삭제가 요구하는 「최근 로그인」 범위.
const ReauthWindow = 10 * time.Minute

// ErrReauthRequired — 화면이 이 문구를 보고 「다시 로그인」 버튼을 띄운다(코드는 Forbidden).
const ErrReauthRequiredMsg = "reauth_required"

// requireRecentLogin — @plm SRS-095  소셜 전용 계정이 위험한 일(계정 삭제·첫 비밀번호 설정)을 하려면
// ReauthWindow 안에 로그인(새 세션 계열)했어야 한다. 두 경로가 같은 검사를 쓰게 한 곳에 둔다(qa 재확인 H-1).
func (s *Service) requireRecentLogin(ctx context.Context, a *Account, userID string) error {
	at, err := a.Repo.LastLoginAt(ctx, userID)
	if err != nil {
		return err
	}
	if s.now().Sub(at) > ReauthWindow {
		return errs.New(errs.Forbidden, ErrReauthRequiredMsg)
	}
	return nil
}

func (s *Service) DeleteAccount(ctx context.Context, userID, password, confirm string) error {
	a, err := s.account()
	if err != nil {
		return err
	}
	if c := strings.TrimSpace(confirm); c != DeleteConfirmWord && c != DeleteConfirmWordEN {
		return errs.New(errs.Validation, "확인 문구가 맞지 않습니다")
	}
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if u.PasswordHash != "" {
		if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
			return errs.New(errs.Validation, "비밀번호가 올바르지 않습니다")
		}
	} else if err := s.requireRecentLogin(ctx, a, userID); err != nil {
		return err
	}
	ok, keys, err := a.Repo.DeleteUserAccount(ctx, userID)
	if err != nil {
		return err
	}
	if !ok {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if a.OnAccountDeleted != nil {
		a.OnAccountDeleted(userID, keys) // 바이트 청소 — 실패해도 계정 삭제는 끝났다(호출자가 기록)
	}
	return nil
}
