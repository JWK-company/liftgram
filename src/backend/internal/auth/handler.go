// @plm SRS-006  계정·인증 RPC
//
// 핸들러가 하는 일은 셋뿐이다: proto ↔ 도메인 변환 · 서비스 호출 · 신원 꺼내기.
// 규칙도 SQL도 여기 없다. 검증은 .proto의 선언이 인터셉터로 적용되고,
// 오류는 도메인 오류를 그대로 돌려주면 middleware/errors.go가 Connect 코드로 옮긴다.
package auth

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	authv1 "github.com/JWK-company/liftgram/src/backend/gen/auth/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/auth/v1/authv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type Handler struct {
	authv1connect.UnimplementedAuthServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) SignUp(ctx context.Context, req *connect.Request[authv1.SignUpRequest]) (*connect.Response[authv1.SignUpResponse], error) {
	u, tokens, err := h.svc.SignUp(ctx, req.Msg.GetEmail(), req.Msg.GetPassword(), req.Msg.GetDisplayName())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.SignUpResponse{Tokens: toProtoTokens(tokens), User: toProtoUser(u)}), nil
}

func (h *Handler) LogIn(ctx context.Context, req *connect.Request[authv1.LogInRequest]) (*connect.Response[authv1.LogInResponse], error) {
	u, tokens, err := h.svc.LogIn(ctx, req.Msg.GetEmail(), req.Msg.GetPassword())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.LogInResponse{Tokens: toProtoTokens(tokens), User: toProtoUser(u)}), nil
}

func (h *Handler) Refresh(ctx context.Context, req *connect.Request[authv1.RefreshRequest]) (*connect.Response[authv1.RefreshResponse], error) {
	u, tokens, err := h.svc.Refresh(ctx, req.Msg.GetRefreshToken())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.RefreshResponse{Tokens: toProtoTokens(tokens), User: toProtoUser(u)}), nil
}

func (h *Handler) LogOut(ctx context.Context, req *connect.Request[authv1.LogOutRequest]) (*connect.Response[authv1.LogOutResponse], error) {
	if err := h.svc.LogOut(ctx, req.Msg.GetRefreshToken()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.LogOutResponse{}), nil
}

func (h *Handler) Me(ctx context.Context, _ *connect.Request[authv1.MeRequest]) (*connect.Response[authv1.MeResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	u, err := h.svc.Me(ctx, id)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.MeResponse{User: toProtoUser(u)}), nil
}

func (h *Handler) UpdateProfile(ctx context.Context, req *connect.Request[authv1.UpdateProfileRequest]) (*connect.Response[authv1.UpdateProfileResponse], error) {
	id, ok := UserIDFrom(ctx)
	if !ok {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	u, err := h.svc.UpdateProfile(ctx, id, ProfilePatch{
		DisplayName:        req.Msg.GetDisplayName(),
		SetDisplayName:     req.Msg.GetSetDisplayName(),
		AvatarURL:          req.Msg.GetAvatarUrl(),
		SetAvatarURL:       req.Msg.GetSetAvatarUrl(),
		ExperienceLevel:    fromProtoExperience(req.Msg.GetExperienceLevel()),
		SetExperienceLevel: req.Msg.GetSetExperienceLevel(),
		TrainerIntent:      req.Msg.GetTrainerIntent(),
		SetTrainerIntent:   req.Msg.GetSetTrainerIntent(),
	})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&authv1.UpdateProfileResponse{User: toProtoUser(u)}), nil
}

// ── 변환 ─────────────────────────────────────────────────────────────────────

func toProtoTokens(t Tokens) *authv1.Tokens {
	return &authv1.Tokens{
		AccessToken:  t.AccessToken,
		RefreshToken: t.RefreshToken,
		ExpiresIn:    t.ExpiresIn,
	}
}

func toProtoUser(u User) *authv1.User {
	return &authv1.User{
		Id:              u.ID,
		Email:           u.Email,
		DisplayName:     u.DisplayName,
		AvatarUrl:       u.AvatarURL,
		Role:            toProtoRole(u.Role),
		ExperienceLevel: toProtoExperience(u.ExperienceLevel),
		TrainerIntent:   u.TrainerIntent,
		CreatedAt:       timestamppb.New(u.CreatedAt),
	}
}

func toProtoRole(r string) authv1.Role {
	switch r {
	case "user":
		return authv1.Role_ROLE_USER
	case "coworker":
		return authv1.Role_ROLE_COWORKER
	case "moderator":
		return authv1.Role_ROLE_MODERATOR
	case "admin":
		return authv1.Role_ROLE_ADMIN
	}
	return authv1.Role_ROLE_UNSPECIFIED
}

func toProtoExperience(e string) authv1.ExperienceLevel {
	switch e {
	case "beginner":
		return authv1.ExperienceLevel_EXPERIENCE_LEVEL_BEGINNER
	case "intermediate":
		return authv1.ExperienceLevel_EXPERIENCE_LEVEL_INTERMEDIATE
	case "advanced":
		return authv1.ExperienceLevel_EXPERIENCE_LEVEL_ADVANCED
	}
	return authv1.ExperienceLevel_EXPERIENCE_LEVEL_UNSPECIFIED
}

// UNSPECIFIED는 빈 문자열로 — 저장소에서는 null이 되어 "고르지 않음"을 뜻한다.
func fromProtoExperience(e authv1.ExperienceLevel) string {
	switch e {
	case authv1.ExperienceLevel_EXPERIENCE_LEVEL_BEGINNER:
		return "beginner"
	case authv1.ExperienceLevel_EXPERIENCE_LEVEL_INTERMEDIATE:
		return "intermediate"
	case authv1.ExperienceLevel_EXPERIENCE_LEVEL_ADVANCED:
		return "advanced"
	}
	return ""
}
