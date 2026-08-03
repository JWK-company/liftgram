// @plm SRS-006  동기 RPC
//
// 계약과 도메인 사이의 번역만 한다. 레코드는 **JSON 문자열 그대로** 오간다 —
// 여기서 파싱하면 서버가 스키마를 아는 셈이 되고, 앱에 컬럼이 하나 늘 때마다 서버를 고쳐야 한다.
package sync

import (
	"context"

	"connectrpc.com/connect"

	syncv1 "github.com/JWK-company/liftgram/src/backend/gen/sync/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/sync/v1/syncv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	syncv1connect.UnimplementedSyncServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Pull(ctx context.Context, req *connect.Request[syncv1.PullRequest]) (*connect.Response[syncv1.PullResponse], error) {
	id, _ := auth.UserIDFrom(ctx)
	res, err := h.svc.Pull(ctx, id, req.Msg.GetLastPulledAt())
	if err != nil {
		return nil, err
	}
	changes := make(map[string]*syncv1.TableChanges, len(res.Changes))
	for name, t := range res.Changes {
		changes[name] = &syncv1.TableChanges{
			// 서버는 살아 있는 레코드를 전부 updated로 보낸다(계약 주석 참고).
			Updated: t.Updated,
			Deleted: t.Deleted,
		}
	}
	return connect.NewResponse(&syncv1.PullResponse{Changes: changes, Timestamp: res.Timestamp}), nil
}

func (h *Handler) Push(ctx context.Context, req *connect.Request[syncv1.PushRequest]) (*connect.Response[syncv1.PushResponse], error) {
	id, _ := auth.UserIDFrom(ctx)
	changes := make(map[string]TableChanges, len(req.Msg.GetChanges()))
	for name, t := range req.Msg.GetChanges() {
		changes[name] = TableChanges{
			Created: t.GetCreated(),
			Updated: t.GetUpdated(),
			Deleted: t.GetDeleted(),
		}
	}
	if err := h.svc.Push(ctx, id, changes); err != nil {
		return nil, err
	}
	return connect.NewResponse(&syncv1.PushResponse{}), nil
}
