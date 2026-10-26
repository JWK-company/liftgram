// @plm SRS-052  정식 계정 RPC — 변환 · 서비스 호출 · 신원 · 사람 확인 · 인증 요청 제한
//
// 로그인 없이 메일을 내보내는 입구(가입·비밀번호 찾기)는 두 겹으로 막는다:
//
//	① 사람 확인(Turnstile · 헤더 X-Turnstile-Token) — 키가 없으면 건너뛴다
//	② 인증 전용 요청 제한(IP·10회/분) — 전역 제한(120회/분)은 화면 전체를 위한 값이라 너무 넉넉하다
//
// IP 는 web 가장자리(server.mjs)가 정한 X-Forwarded-For 첫 값이다. 운영에서는 Cloudflare 가 붙인
// CF-Connecting-IP 만 믿어 그 자리에 세운다(위조한 XFF 는 거기서 버려진다).
package auth

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	authv1 "github.com/JWK-company/liftgram/src/backend/gen/auth/v1"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 인증 요청 제한 ──────────────────────────────────────────────────────────

// AuthLimiter — 키(절차|IP)마다 창 안의 횟수를 센다. 인스턴스 하나짜리 운영이라 메모리면 충분하다.
type AuthLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
}

// NewAuthLimiter — limit <= 0 이면 끈다(개발·e2e).
func NewAuthLimiter(limit int, window time.Duration) *AuthLimiter {
	return &AuthLimiter{limit: limit, window: window, hits: map[string][]time.Time{}}
}

// Allow — 허용이면 true. 오래된 기록은 그 자리에서 걷어낸다.
func (l *AuthLimiter) Allow(key string) bool {
	if l == nil || l.limit <= 0 {
		return true
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.window {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	if len(l.hits) > 50_000 { // 폭주 방어 — 오래된 키를 통째로 비운다
		l.hits = map[string][]time.Time{}
	}
	return true
}

// WithLimiter — 인증 전용 제한을 끼운다.
func (h *Handler) WithLimiter(l *AuthLimiter) *Handler {
	h.limiter = l
	return h
}

func clientIP(hd http.Header) string {
	if v := hd.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	return ""
}

func (h *Handler) guard(proc string, hd http.Header) error {
	if !h.limiter.Allow(proc + "|" + clientIP(hd)) {
		return errs.New(errs.Unavailable, "요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요")
	}
	return nil
}

// ── RPC ─────────────────────────────────────────────────────────────────────

func (h *Handler) GetAuthOptions(context.Context, *connect.Request[authv1.GetAuthOptionsRequest]) (*connect.Response[authv1.GetAuthOptionsResponse], error) {
	return connect.NewResponse(&authv1.GetAuthOptionsResponse{Providers: h.svc.Providers(), MailEnabled: h.svc.MailEnabled()}), nil
}

func (h *Handler) SendEmailVerification(ctx context.Context, req *connect.Request[authv1.SendEmailVerificationRequest]) (*connect.Response[authv1.SendEmailVerificationResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if err := h.guard("verify-send", req.Header()); err != nil {
		return nil, err
	}
	wait, err := h.svc.SendEmailVerification(ctx, id)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.SendEmailVerificationResponse{RetryAfterSec: wait}), nil
}

func (h *Handler) VerifyEmail(ctx context.Context, req *connect.Request[authv1.VerifyEmailRequest]) (*connect.Response[authv1.VerifyEmailResponse], error) {
	if err := h.guard("verify", req.Header()); err != nil {
		return nil, err
	}
	if err := h.svc.VerifyEmail(ctx, req.Msg.GetToken()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.VerifyEmailResponse{}), nil
}

func (h *Handler) RequestPasswordReset(ctx context.Context, req *connect.Request[authv1.RequestPasswordResetRequest]) (*connect.Response[authv1.RequestPasswordResetResponse], error) {
	if err := h.guard("reset-request", req.Header()); err != nil {
		return nil, err
	}
	if err := h.svc.CheckHuman(ctx, req.Header().Get(TurnstileHeader), clientIP(req.Header())); err != nil {
		return nil, err
	}
	if err := h.svc.RequestPasswordReset(ctx, req.Msg.GetEmail()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.RequestPasswordResetResponse{}), nil
}

func (h *Handler) ResetPassword(ctx context.Context, req *connect.Request[authv1.ResetPasswordRequest]) (*connect.Response[authv1.ResetPasswordResponse], error) {
	if err := h.guard("reset", req.Header()); err != nil {
		return nil, err
	}
	if err := h.svc.ResetPassword(ctx, req.Msg.GetToken(), req.Msg.GetNewPassword()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.ResetPasswordResponse{}), nil
}

func (h *Handler) ChangePassword(ctx context.Context, req *connect.Request[authv1.ChangePasswordRequest]) (*connect.Response[authv1.ChangePasswordResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if err := h.guard("password", req.Header()); err != nil {
		return nil, err
	}
	tokens, err := h.svc.ChangePassword(ctx, id, req.Msg.GetCurrentPassword(), req.Msg.GetNewPassword())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.ChangePasswordResponse{Tokens: toProtoTokens(tokens)}), nil
}

func (h *Handler) ExchangeLoginCode(ctx context.Context, req *connect.Request[authv1.ExchangeLoginCodeRequest]) (*connect.Response[authv1.ExchangeLoginCodeResponse], error) {
	if err := h.guard("login-code", req.Header()); err != nil {
		return nil, err
	}
	u, tokens, created, err := h.svc.ExchangeLoginCode(ctx, req.Msg.GetCode())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.ExchangeLoginCodeResponse{
		Tokens: toProtoTokens(tokens), User: toProtoUser(u), Created: created,
	}), nil
}

func (h *Handler) CreateLinkTicket(ctx context.Context, _ *connect.Request[authv1.CreateLinkTicketRequest]) (*connect.Response[authv1.CreateLinkTicketResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	t, err := h.svc.CreateLinkTicket(ctx, id)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.CreateLinkTicketResponse{Ticket: t}), nil
}

func (h *Handler) ListIdentities(ctx context.Context, _ *connect.Request[authv1.ListIdentitiesRequest]) (*connect.Response[authv1.ListIdentitiesResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	ids, err := h.svc.ListIdentities(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]*authv1.Identity, 0, len(ids))
	for _, i := range ids {
		out = append(out, &authv1.Identity{Provider: i.Provider, Email: i.Email, CreatedAt: timestamppb.New(i.CreatedAt)})
	}
	return connect.NewResponse(&authv1.ListIdentitiesResponse{Identities: out}), nil
}

func (h *Handler) UnlinkIdentity(ctx context.Context, req *connect.Request[authv1.UnlinkIdentityRequest]) (*connect.Response[authv1.UnlinkIdentityResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if err := h.svc.UnlinkIdentity(ctx, id, req.Msg.GetProvider()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.UnlinkIdentityResponse{}), nil
}
