// @plm SRS-027  콘솔 발송 — 개발 기본값. 메일 서버 없이 전 인증 플로우를 돌린다
//
// 이것이 dev 기본값인 이유: 인증 플로우 개발은 "링크를 클릭"이 핵심인데, 그 링크만 볼 수 있으면
// SMTP도 Mailpit도 없이 진행된다. 새로 합류한 사람이 `make dev` 하나로 가입까지 해 볼 수 있어야 한다.
//
// ⚠ **운영에서 이것이 켜지면 메일이 조용히 사라진다.** 그래서 부팅 시 경고를 한 번 찍는다 —
//
//	config가 MAIL_TRANSPORT=smtp인데 HOST가 비면 부팅을 실패시키는 것과 같은 계열의 방어다.
package mailer

import (
	"context"
	"log/slog"
	"regexp"
)

type consoleSender struct{}

// NewConsole — 개발용. 실패하지 않는다.
func NewConsole() Sender {
	slog.Warn("[mailer] transport=console — 메일이 실제로 발송되지 않고 로그로만 출력됩니다(개발 전용)")
	return &consoleSender{}
}

// 본문에서 첫 http(s) 링크를 뽑는다 — 개발자가 로그에서 바로 눌러 볼 수 있게.
var linkRe = regexp.MustCompile(`https?://\S+`)

func (c *consoleSender) Send(_ context.Context, m Mail) error {
	// 콘솔이라도 validate를 건너뛰지 않는다. 헤더 인젝션은 개발 중에 잡아야
	// 운영 전환 시점에 처음 드러나지 않는다.
	if err := m.validate(); err != nil {
		return err
	}
	link := linkRe.FindString(m.TextBody)
	slog.Info("[mailer] (console) 메일",
		"to", m.To, // 개발 환경이므로 가리지 않는다 — 링크를 눌러 봐야 한다
		"subject", m.Subject,
		"link", link)
	return nil
}
