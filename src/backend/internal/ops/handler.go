// @plm SRS-088  운영 상태 RPC — 신원·역할을 꺼내 service에 넘긴다
//
// 역할 판정은 여기서 하지 않는다(service 가 claim + DB 역할로 한다) — 판단이 규칙 옆에 있어야 테스트로 못박는다.
package ops

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	opsv1 "github.com/JWK-company/liftgram/src/backend/gen/ops/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/ops/v1/opsv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	opsv1connect.UnimplementedOpsServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func who(ctx context.Context) (string, string) {
	id, _ := auth.UserIDFrom(ctx)
	role, _ := auth.RoleFrom(ctx)
	return id, role
}

func (h *Handler) ReportClientHealth(ctx context.Context, req *connect.Request[opsv1.ReportClientHealthRequest]) (*connect.Response[opsv1.ReportClientHealthResponse], error) {
	id, _ := who(ctx)
	m := req.Msg
	r := Report{
		DeviceID:            m.GetDeviceId(),
		AppVersion:          m.GetAppVersion(),
		SuccessAgeMs:        m.SuccessAgeMs,
		AttemptAgeMs:        m.AttemptAgeMs,
		ConsecutiveFailures: int64(m.GetConsecutiveFailures()),
		Blocked:             m.GetBlocked(),
		LastError:           m.GetLastError(),
	}
	if m.Pending != nil {
		p := int64(*m.Pending)
		r.Pending = &p
	}
	// 분당 상한에 걸려도 오류로 답하지 않는다 — 기기는 다음 시도에 다시 보낸다.
	if _, err := h.svc.ReportClientHealth(ctx, id, r); err != nil {
		return nil, err
	}
	return connect.NewResponse(&opsv1.ReportClientHealthResponse{}), nil
}

func (h *Handler) GetOpsStatus(ctx context.Context, _ *connect.Request[opsv1.GetOpsStatusRequest]) (*connect.Response[opsv1.GetOpsStatusResponse], error) {
	id, role := who(ctx)
	st, err := h.svc.GetOpsStatus(ctx, id, role)
	if err != nil {
		return nil, err
	}
	out := &opsv1.GetOpsStatusResponse{
		Alert:        st.Alert,
		AlertReasons: st.Reasons,
		ServerNow:    timestamppb.New(st.Now),
		Backup: &opsv1.BackupStatus{
			LastDaily:       toBackup(st.Backup.LastDaily),
			LastRestoreTest: toBackup(st.Backup.LastRestoreTest),
		},
	}
	if st.Backup.LastOkDaily != nil {
		out.Backup.LastOkDailyAt = timestamppb.New(st.Backup.LastOkDaily.CreatedAt)
	}
	for _, u := range st.Users {
		devs := make([]*opsv1.DeviceHealth, 0, len(u.Devices))
		for _, d := range u.Devices {
			devs = append(devs, toDevice(d))
		}
		out.Users = append(out.Users, &opsv1.OpsUser{
			UserId:       u.User.ID,
			EmailHint:    EmailHint(u.User.Email),
			DisplayName:  u.User.DisplayName,
			LastSyncAt:   tsp(u.User.LastSyncAt),
			LastActiveAt: tsp(u.User.LastActiveAt),
			Devices:      devs,
		})
	}
	for _, s := range st.Stalled {
		out.Stalled = append(out.Stalled, &opsv1.StalledDevice{
			UserId:      s.User.ID,
			EmailHint:   EmailHint(s.User.Email),
			DisplayName: s.User.DisplayName,
			Device:      toDevice(s.Device),
			Days:        s.Days,
		})
	}
	return connect.NewResponse(out), nil
}

func (h *Handler) GetOpsAlert(ctx context.Context, _ *connect.Request[opsv1.GetOpsAlertRequest]) (*connect.Response[opsv1.GetOpsAlertResponse], error) {
	id, role := who(ctx)
	alert, n, err := h.svc.GetOpsAlert(ctx, id, role)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&opsv1.GetOpsAlertResponse{Alert: alert, Count: int32(n)}), nil
}

// ── 변환 ─────────────────────────────────────────────────────────────────────

func toDevice(d Health) *opsv1.DeviceHealth {
	pending := int32(-1)
	if d.Pending != nil {
		pending = *d.Pending
	}
	return &opsv1.DeviceHealth{
		DeviceId:            d.DeviceID,
		AppVersion:          d.AppVersion,
		LastSuccessAt:       tsp(d.LastSuccessAt),
		LastAttemptAt:       tsp(d.LastAttemptAt),
		ConsecutiveFailures: d.ConsecutiveFailures,
		Pending:             pending,
		Blocked:             d.Blocked,
		LastError:           d.LastError,
		FirstReportedAt:     timestamppb.New(d.FirstReportedAt),
		ReportedAt:          timestamppb.New(d.ReportedAt),
	}
}

func toBackup(b *BackupRun) *opsv1.BackupRun {
	if b == nil {
		return nil
	}
	return &opsv1.BackupRun{
		Kind:          b.Kind,
		Ok:            b.OK,
		SizeBytes:     b.SizeBytes,
		Tables:        b.Tables,
		DiskFreeBytes: b.DiskFreeBytes,
		Detail:        b.Detail,
		CreatedAt:     timestamppb.New(b.CreatedAt),
	}
}

func tsp(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return timestamppb.New(*t)
}
