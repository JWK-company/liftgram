// 운영 메타 — 실행 환경의 사실을 답한다
//
// 이 패키지에는 service도 repo도 없다. 답할 것이 **주입받은 두 값뿐**이라 규칙이 없기 때문이다.
// 층을 억지로 만들면 읽는 사람이 "규칙이 어디 있나" 하고 찾게 된다.
package meta

import (
	"context"

	"connectrpc.com/connect"

	metav1 "github.com/JWK-company/liftgram/src/backend/gen/meta/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/meta/v1/metav1connect"
)

// Bus는 지금 어떤 방식으로 전파하는지만 알려 준다(memory | redis).
type Bus interface {
	Kind() string
}

type Handler struct {
	metav1connect.UnimplementedMetaServiceHandler
	bus      Bus
	instance string
}

func NewHandler(bus Bus, instance string) *Handler {
	return &Handler{bus: bus, instance: instance}
}

func (h *Handler) GetMeta(_ context.Context, _ *connect.Request[metav1.GetMetaRequest]) (*connect.Response[metav1.GetMetaResponse], error) {
	return connect.NewResponse(&metav1.GetMetaResponse{
		Instance: h.instance,
		Bus:      h.bus.Kind(),
	}), nil
}
