package ops

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/mailer"
)

type fakeMailRepo struct {
	st     AlertMailState
	admins []string
	saves  int
}

func (f *fakeMailRepo) GetAlertMailState(context.Context) (AlertMailState, error) { return f.st, nil }
func (f *fakeMailRepo) SaveAlertMailState(_ context.Context, st AlertMailState) error {
	f.st = st
	f.saves++
	return nil
}
func (f *fakeMailRepo) ListAdminEmails(context.Context) ([]string, error) { return f.admins, nil }

type fakeSender struct {
	sent []mailer.Mail
	err  error
}

func (f *fakeSender) Send(_ context.Context, m mailer.Mail) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, m)
	return nil
}

func TestShouldSendAlertMail(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name    string
		st      AlertMailState
		reasons []string
		want    bool
	}{
		{"경고 없음", AlertMailState{}, nil, false},
		{"처음 경고", AlertMailState{}, []string{ReasonStalled}, true},
		{"이미 알림·1시간 뒤", AlertMailState{[]string{ReasonStalled}, now.Add(-time.Hour)}, []string{ReasonStalled}, false},
		{"새 경고·간격 안", AlertMailState{[]string{ReasonStalled}, now.Add(-time.Hour)}, []string{ReasonStalled, ReasonLowDisk}, false},
		{"새 경고·간격 지남", AlertMailState{[]string{ReasonStalled}, now.Add(-AlertMailMinGap)}, []string{ReasonStalled, ReasonLowDisk}, true},
		{"풀린 뒤 재발·간격 안", AlertMailState{[]string{}, now.Add(-time.Hour)}, []string{ReasonStalled}, false},
		{"일부만 풀림", AlertMailState{[]string{ReasonStalled, ReasonLowDisk}, now.Add(-time.Hour)}, []string{ReasonLowDisk}, false},
		{"24시간 지남", AlertMailState{[]string{ReasonStalled}, now.Add(-AlertMailRepeat)}, []string{ReasonStalled}, true},
	}
	for _, c := range cases {
		if got := ShouldSendAlertMail(c.st, c.reasons, now); got != c.want {
			t.Errorf("%s: got %v", c.name, got)
		}
	}
}

func alertSvc(now time.Time) *Service {
	// 백업 기록이 하나도 없으면 daily_none·restore_none 경고가 난다.
	return NewService(&fakeRepo{}, func() time.Time { return now })
}

func TestCheckAlertMailSendsToEveryAdminOnce(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	repo := &fakeMailRepo{admins: []string{"a@example.com", "b@example.com"}}
	sender := &fakeSender{}
	s := alertSvc(now)
	for range 2 {
		if err := s.CheckAlertMail(context.Background(), repo, sender, "https://admin.example/"); err != nil {
			t.Fatal(err)
		}
	}
	if len(sender.sent) != 2 {
		t.Fatalf("관리자마다 한 번씩 두 통이어야 한다: %d", len(sender.sent))
	}
	body := sender.sent[0].TextBody
	if !strings.Contains(body, "https://admin.example/ops") || !strings.Contains(body, "일일 백업 기록이 없습니다") {
		t.Fatalf("본문: %s", body)
	}
}

func TestCheckAlertMailFailureRetries(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	repo := &fakeMailRepo{admins: []string{"a@example.com"}}
	sender := &fakeSender{err: errors.New("smtp down")}
	if err := alertSvc(now).CheckAlertMail(context.Background(), repo, sender, "https://x"); err == nil {
		t.Fatal("전부 실패하면 오류를 돌려줘야 한다")
	}
	if repo.saves != 0 {
		t.Fatal("실패하면 상태를 적지 않아 다음 주기에 다시 보낸다")
	}
}

// 일부만 풀린 경고가 다시 생기면 새 경고로 알린다(간격이 지난 뒤).
func TestCheckAlertMailPartialClearForgetsThatReason(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	svc := alertSvc(now)
	active, err := svc.currentReasons(context.Background())
	if err != nil || len(active) == 0 {
		t.Fatalf("시험 전제: 경고가 있어야 한다 %v %v", active, err)
	}
	gone := ReasonUsageTable // 지금 켜져 있지 않은 경고
	repo := &fakeMailRepo{
		st:     AlertMailState{Reasons: append([]string{gone}, active...), SentAt: now.Add(-time.Hour)},
		admins: []string{"a@example.com"},
	}
	sender := &fakeSender{}
	if err := svc.CheckAlertMail(context.Background(), repo, sender, "https://x"); err != nil {
		t.Fatal(err)
	}
	if len(sender.sent) != 0 {
		t.Fatalf("이미 알린 경고만 남았으니 보내지 않는다: %d", len(sender.sent))
	}
	for _, r := range repo.st.Reasons {
		if r == gone {
			t.Fatalf("풀린 경고를 기억에서 빼야 한다: %v", repo.st.Reasons)
		}
	}
	if !repo.st.SentAt.Equal(now.Add(-time.Hour)) {
		t.Fatalf("마지막 발송 시각은 유지한다: %v", repo.st.SentAt)
	}
}
