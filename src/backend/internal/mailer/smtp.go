// @plm SRS-027  SMTP 발송 — 표준 net/smtp. 벤더 SDK를 들이지 않는다(ADR-015 D2)
//
// 왜 표준 라이브러리인가: 우리가 보내는 것은 1:1 인증 메일뿐이고, 필요한 것은
// "STARTTLS로 한 통 보내기"가 전부다. 벤더 SDK는 그 대가로 의존과 자격증명 형식을 들여온다.
// 도달률 관리가 필요해지면 이 파일 하나를 API 프로바이더 구현으로 교체한다.
//
// ⚠ **STARTTLS 성공을 확인하고, 실패하면 보내지 않는다.**
//
//	재설정 토큰은 그 자체가 계정 접근 권한이다. 평문으로 나가면 경로상 누구나 가로챌 수 있다.
//	많은 SMTP 코드가 "STARTTLS 되면 하고 안 되면 그냥 보낸다"로 쓰여 있는데,
//	그것은 능동 공격자가 EHLO 응답에서 STARTTLS를 지우기만 하면 평문으로 내려앉는다(다운그레이드).
package mailer

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// SMTPConfig는 main.go가 config.Config에서 옮겨 담는다.
// mailer가 config를 import하지 않는다 — 설정 해석은 조립 지점의 몫이다.
type SMTPConfig struct {
	Host       string
	Port       int
	Username   string // 비면 AUTH를 생략한다(로컬 Mailpit)
	Password   string
	From       string // "BookTaraeEng <no-reply@example.com>" 형태 허용
	Timeout    time.Duration
	RequireTLS bool // 운영 true. 로컬 Mailpit은 TLS를 제공하지 않으므로 false
}

type smtpSender struct{ cfg SMTPConfig }

// NewSMTP — 설정이 성립하는지 여기서 본다. 부팅 시점에 죽는 편이
// 첫 가입자의 메일이 조용히 안 나가는 것보다 낫다.
func NewSMTP(cfg SMTPConfig) (Sender, error) {
	if strings.TrimSpace(cfg.Host) == "" {
		return nil, fmt.Errorf("mailer: MAIL_SMTP_HOST가 비어 있습니다")
	}
	if strings.TrimSpace(cfg.From) == "" {
		return nil, fmt.Errorf("mailer: MAIL_FROM이 비어 있습니다")
	}
	if cfg.Port == 0 {
		cfg.Port = 587
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 10 * time.Second
	}
	return &smtpSender{cfg: cfg}, nil
}

func (s *smtpSender) Send(ctx context.Context, m Mail) error {
	if err := m.validate(); err != nil {
		return err
	}
	// 연결·TLS·AUTH 는 open 이 한다 — Probe 와 **같은 길**을 타야 「점검 OK 인데 발송은 실패」가 안 생긴다.
	c, err := s.open(ctx)
	if err != nil {
		return err
	}
	defer c.Close()

	if err := c.Mail(envelopeAddr(s.cfg.From)); err != nil {
		return fmt.Errorf("mailer: MAIL FROM 거절: %w", err)
	}
	if err := c.Rcpt(m.To); err != nil {
		return fmt.Errorf("mailer: RCPT TO 거절: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("mailer: DATA 거절: %w", err)
	}
	if _, err := w.Write(buildMIME(s.cfg.From, m)); err != nil {
		w.Close()
		return fmt.Errorf("mailer: 본문 전송 실패: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("mailer: 본문 종료 실패: %w", err)
	}
	return c.Quit()
}

// Probe — 메일을 **보내지 않고** 발신 가능 여부를 본다(@plm SRS-027 · auth-golive P0).
//
// 연결·TLS·AUTH·**MAIL FROM** 까지 가고 RSET·QUIT 으로 물러난다. RCPT·DATA 를 안 하므로
// 아무에게도 메일이 가지 않는다. 2026-10-01 운영 장애(「Email sending is not enabled for domain」)가
// 정확히 MAIL FROM 거절이었다 — 이 점검이면 첫 가입자보다 먼저 잡힌다.
func (s *smtpSender) Probe(ctx context.Context) error {
	c, err := s.open(ctx)
	if err != nil {
		return err
	}
	defer c.Close()
	if err := c.Mail(envelopeAddr(s.cfg.From)); err != nil {
		return fmt.Errorf("mailer: MAIL FROM 거절: %w", err)
	}
	if err := c.Reset(); err != nil {
		return fmt.Errorf("mailer: RSET 실패: %w", err)
	}
	return c.Quit()
}

// open — 연결(465 implicit TLS · 그 외 STARTTLS 승격) → AUTH 까지. 실패하면 연결을 닫고 돌아온다.
func (s *smtpSender) open(ctx context.Context) (*smtp.Client, error) {
	addr := net.JoinHostPort(s.cfg.Host, fmt.Sprint(s.cfg.Port))

	// net/smtp는 ctx를 모른다 — 연결에만 데드라인을 걸 수 있다.
	// 그래서 ctx 취소는 다이얼 단계에서만 즉시 반영되고, 이후는 타임아웃이 상한이 된다.
	// ── 연결 ──
	// Port 465 = **implicit TLS**: 연결 순간부터 TLS이고 STARTTLS가 없다(예: Cloudflare
	// Email Sending은 465만 지원). 그 외(587 등) = 평문 연결 후 STARTTLS 승격.
	// 두 경로 모두 평문 전송은 허용하지 않는다(465는 처음부터 TLS · 587은 아래 다운그레이드 방어).
	implicitTLS := s.cfg.Port == 465
	d := net.Dialer{Timeout: s.cfg.Timeout}
	var conn net.Conn
	var err error
	if implicitTLS {
		td := tls.Dialer{NetDialer: &d, Config: &tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}}
		conn, err = td.DialContext(ctx, "tcp", addr)
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return nil, fmt.Errorf("mailer: 연결 실패(%s): %w", addr, err)
	}
	// 이후 단계에도 상한을 둔다 — 서버가 응답을 안 주면 고루틴이 영구히 남는다.
	_ = conn.SetDeadline(time.Now().Add(s.cfg.Timeout))

	c, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("mailer: SMTP 핸드셰이크 실패: %w", err)
	}

	// ── STARTTLS (implicit TLS가 아닐 때만 — 465는 이미 TLS다) ──
	if !implicitTLS {
		ok, _ := c.Extension("STARTTLS")
		if ok {
			if err := c.StartTLS(&tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
				c.Close()
				return nil, fmt.Errorf("mailer: STARTTLS 실패: %w", err)
			}
		} else if s.cfg.RequireTLS {
			// 다운그레이드 방어. 여기서 멈추지 않으면 토큰이 평문으로 나간다.
			c.Close()
			return nil, fmt.Errorf("mailer: 서버가 STARTTLS를 제공하지 않습니다 — MAIL_REQUIRE_TLS=true 이므로 보내지 않습니다")
		}
	}

	// ── AUTH ──
	// 자격증명이 있을 때만. Mailpit 같은 개발 서버는 AUTH를 요구하지 않고,
	// 없는데 시도하면 504로 죽는다.
	if s.cfg.Username != "" {
		if err := c.Auth(smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)); err != nil {
			c.Close()
			return nil, fmt.Errorf("mailer: 인증 실패: %w", err)
		}
	}

	return c, nil
}

// envelopeAddr — "이름 <주소>"에서 주소만 뽑는다. 봉투(MAIL FROM)에는 주소만 들어간다.
func envelopeAddr(from string) string {
	if i := strings.LastIndex(from, "<"); i >= 0 {
		if j := strings.Index(from[i:], ">"); j > 0 {
			return from[i+1 : i+j]
		}
	}
	return strings.TrimSpace(from)
}
