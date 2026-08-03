// @plm SRS-039  착용장비 RPC
//
// enum ↔ 도메인 문자열 변환이 여기 있다. DB에는 **문자열**로 남는다(옛 서버와 같은 값) —
// enum은 계약의 표현일 뿐이고, 집계 쿼리는 사람이 읽는 이름으로 도는 편이 낫다.
package gear

import (
	"context"

	"connectrpc.com/connect"

	gearv1 "github.com/JWK-company/liftgram/src/backend/gen/gear/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/gear/v1/gearv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	gearv1connect.UnimplementedGearServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) GetConfig(_ context.Context, _ *connect.Request[gearv1.GetConfigRequest]) (*connect.Response[gearv1.GetConfigResponse], error) {
	cfg := h.svc.GetConfig()
	return connect.NewResponse(&gearv1.GetConfigResponse{Enabled: cfg.Enabled, Links: cfg.Links}), nil
}

func (h *Handler) RecordClick(ctx context.Context, req *connect.Request[gearv1.RecordClickRequest]) (*connect.Response[gearv1.RecordClickResponse], error) {
	id, _ := auth.UserIDFrom(ctx)
	err := h.svc.RecordClick(ctx, id,
		req.Msg.GetPostId(),
		CategoryName(req.Msg.GetCategory()),
		SourceName(req.Msg.GetSource()),
		kindName(req.Msg.GetKind()),
	)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&gearv1.RecordClickResponse{}), nil
}

// ── enum ↔ 문자열 ────────────────────────────────────────────────────────────

var categoryNames = map[gearv1.GearCategory]string{
	gearv1.GearCategory_GEAR_CATEGORY_WRIST_WRAP:  "wristWrap",
	gearv1.GearCategory_GEAR_CATEGORY_STRAP:       "strap",
	gearv1.GearCategory_GEAR_CATEGORY_BELT:        "belt",
	gearv1.GearCategory_GEAR_CATEGORY_KNEE_SLEEVE: "kneeSleeve",
	gearv1.GearCategory_GEAR_CATEGORY_GLOVES:      "gloves",
	gearv1.GearCategory_GEAR_CATEGORY_SHOES:       "shoes",
	gearv1.GearCategory_GEAR_CATEGORY_CHALK:       "chalk",
	gearv1.GearCategory_GEAR_CATEGORY_ARM_SLEEVE:  "armSleeve",
}

func CategoryName(c gearv1.GearCategory) string { return categoryNames[c] }

func CategoryEnum(name string) gearv1.GearCategory {
	for k, v := range categoryNames {
		if v == name {
			return k
		}
	}
	return gearv1.GearCategory_GEAR_CATEGORY_UNSPECIFIED
}

func SourceName(s gearv1.GearSource) string {
	if s == gearv1.GearSource_GEAR_SOURCE_AUTO {
		return "auto"
	}
	return "user"
}

func SourceEnum(name string) gearv1.GearSource {
	if name == "auto" {
		return gearv1.GearSource_GEAR_SOURCE_AUTO
	}
	return gearv1.GearSource_GEAR_SOURCE_USER
}

func kindName(k gearv1.LinkKind) string {
	if k == gearv1.LinkKind_LINK_KIND_DEEPLINK {
		return "deeplink"
	}
	return "search"
}
