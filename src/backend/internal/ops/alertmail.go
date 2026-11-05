// 운영 경고 메일(SPEC-033). 앱의 빨간 점을 운영 웹으로 옮기면서, 운영 웹을 열지 않으면 경고를 모르게 됐다.
// 2026-10 에 경고를 두 달간 놓친 일이 있어 메일로 함께 알린다.
//
// 보내는 때: 지금까지 알리지 않은 경고가 새로 생겼을 때(직전 메일에서 6시간이 지났으면), 또는 경고가 풀리지 않은 채
// 24시간이 지났을 때. 6시간 간격은 경고가 켜졌다 꺼지기를 반복할 때 메일이 쏟아지지 않게 한다. 멈춤 경고는 사용자 기기
// 보고로 켜지므로 밖에서 반복시킬 수 있다.
// 전부 실패하면 상태를 적지 않아 다음 주기에 다시 시도한다. 일부만 실패하면 받은 사람이 있으므로 로그만 남기고,
// 실패한 사람은 다음 메일 때 받는다.
package ops

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/mailer"
)

// AlertMailRepeat — 풀리지 않은 경고를 다시 알리는 간격.
const AlertMailRepeat = 24 * time.Hour

// AlertMailMinGap — 새 경고라도 직전 메일과 이만큼은 띄운다.
const AlertMailMinGap = 6 * time.Hour

// AlertMailState — 마지막으로 알린 내용. 알린 적이 없으면 빈 값이다.
type AlertMailState struct {
	Reasons []string
	SentAt  time.Time
}

// AlertMailRepo — 경고 메일에 필요한 저장소. 없는 줄은 빈 AlertMailState 다.
type AlertMailRepo interface {
	GetAlertMailState(ctx context.Context) (AlertMailState, error)
	SaveAlertMailState(ctx context.Context, st AlertMailState) error
	ListAdminEmails(ctx context.Context) ([]string, error)
}

// NewAlertMailRepo — main 이 경고 메일 작업에 넘기는 저장소.
func NewAlertMailRepo(pool *pgxpool.Pool) AlertMailRepo { return &pgRepo{pool: pool} }

var alertReasonText = map[string]string{
	ReasonStalled:       "동기가 멈춘 사용자가 있습니다",
	ReasonDailyNone:     "일일 백업 기록이 없습니다",
	ReasonDailyStale:    "일일 백업이 36시간 넘게 성공하지 않았습니다",
	ReasonRestoreNone:   "복원 시험 기록이 없습니다",
	ReasonRestoreFailed: "복원 시험이 실패했습니다",
	ReasonRestoreOld:    "복원 시험이 40일 넘게 없었습니다",
	ReasonLowDisk:       "디스크 여유가 부족합니다",
	ReasonUsageTable:    "이용 기록 표가 경고 크기를 넘었습니다",
}

// ShouldSendAlertMail — 순수 판정. 지금 경고와 마지막으로 알린 내용만 본다.
func ShouldSendAlertMail(st AlertMailState, reasons []string, now time.Time) bool {
	if len(reasons) == 0 {
		return false
	}
	known := make(map[string]bool, len(st.Reasons))
	for _, r := range st.Reasons {
		known[r] = true
	}
	for _, r := range reasons {
		if !known[r] {
			return st.SentAt.IsZero() || now.Sub(st.SentAt) >= AlertMailMinGap
		}
	}
	return now.Sub(st.SentAt) >= AlertMailRepeat
}

func stillActive(known, active []string) []string {
	on := make(map[string]bool, len(active))
	for _, r := range active {
		on[r] = true
	}
	out := make([]string, 0, len(known))
	for _, r := range known {
		if on[r] {
			out = append(out, r)
		}
	}
	return out
}

func alertMail(to, adminURL string, reasons []string) mailer.Mail {
	lines := make([]string, 0, len(reasons))
	for _, r := range reasons {
		text, ok := alertReasonText[r]
		if !ok {
			text = "확인이 필요한 경고: " + r
		}
		lines = append(lines, "- "+text)
	}
	return mailer.Mail{
		To:      to,
		Subject: "[리프트그램 운영] 확인이 필요한 경고가 있습니다",
		TextBody: "운영 상태에 확인이 필요한 경고가 있습니다.\n\n" + strings.Join(lines, "\n") +
			"\n\n운영 상태 보기: " + strings.TrimRight(adminURL, "/") + "/ops\n" +
			"\n경고가 풀리지 않으면 24시간마다 다시 보냅니다.\n",
	}
}

// CheckAlertMail — 한 번 판정하고 필요하면 보낸다. 사람 요청이 아니라 역할 판정이 없다.
func (s *Service) CheckAlertMail(ctx context.Context, repo AlertMailRepo, sender mailer.Sender, adminURL string) error {
	reasons, err := s.currentReasons(ctx)
	if err != nil {
		return err
	}
	st, err := repo.GetAlertMailState(ctx)
	if err != nil {
		return err
	}
	now := s.now()
	// 풀린 경고는 기억에서 뺀다. 같은 경고가 다시 생기면 새 경고로 알린다. 일부만 풀려도 같다.
	still := stillActive(st.Reasons, reasons)
	if len(still) != len(st.Reasons) {
		st.Reasons = still
		if err := repo.SaveAlertMailState(ctx, st); err != nil {
			return err
		}
	}
	if !ShouldSendAlertMail(st, reasons, now) {
		return nil
	}
	admins, err := repo.ListAdminEmails(ctx)
	if err != nil {
		return err
	}
	if len(admins) == 0 {
		slog.Warn("운영 경고를 받을 관리자 메일이 없다", "reasons", reasons)
		return nil
	}
	sent := 0
	var lastErr error
	for _, to := range admins {
		if err := sender.Send(ctx, alertMail(to, adminURL, reasons)); err != nil {
			lastErr = err
			continue
		}
		sent++
	}
	if sent == 0 {
		return lastErr
	}
	if lastErr != nil {
		slog.Warn("운영 경고 메일 일부 실패", "sent", sent, "total", len(admins), "err", lastErr)
	}
	slog.Info("운영 경고 메일 보냄", "sent", sent, "reasons", reasons)
	return repo.SaveAlertMailState(ctx, AlertMailState{Reasons: reasons, SentAt: now})
}

// AlertMailLoop — interval 이 0 이하면 돌지 않는다. 첫 판정은 부팅 직후의 흔들림을 피해 한 주기 뒤에 한다.
func (s *Service) AlertMailLoop(ctx context.Context, repo AlertMailRepo, sender mailer.Sender, adminURL string, interval time.Duration) {
	if interval <= 0 {
		return
	}
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.CheckAlertMail(ctx, repo, sender, adminURL); err != nil && ctx.Err() == nil {
				slog.Error("운영 경고 메일 판정 실패", "err", err)
			}
		}
	}
}
