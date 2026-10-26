// @plm SRS-027 [SAD-005]  메일 발송 — 인터페이스와 안전장치. SMTP도 템플릿도 여기서 모른다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **무엇을 보내는가(Mail)와 누가 보내는가(Sender)의 계약, 그리고 보내기 전 검사.**
//
// 구현체는 둘이다 — smtp.go(운영·CI)와 console.go(개발). 조립은 main.go가 한다.
// 도메인(internal/auth)은 Sender 인터페이스만 알고, 어느 구현이 끼워졌는지 모른다.
//
// ⚠ 이 파일이 존재하는 가장 큰 이유는 인터페이스가 아니라 **validate**다.
//
//	메일 헤더에 CR/LF가 들어가면 공격자가 헤더를 추가로 주입할 수 있고(Bcc: victim@…),
//	그 순간 우리 도메인이 피싱·스팸 발신기가 된다. 구현체마다 막으면 언젠가 한 곳이 빠진다 —
//	그래서 **모든 구현체가 Send 첫 줄에서 이것을 부른다**.
//
// ─────────────────────────────────────────────────────────────────────────────
package mailer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Mail은 한 통의 메일이다. 수신자는 하나뿐이다 — 인증 메일은 본질적으로 1:1이고,
// 다수 수신을 허용하면 실수로 주소가 섞여 나갈 여지가 생긴다.
type Mail struct {
	To       string
	Subject  string
	TextBody string // 필수 — 텍스트 전용 클라이언트가 아직 있다
	HTMLBody string // 선택. 비면 텍스트만 보낸다
}

// Sender는 이 패키지가 바깥에 약속하는 전부다. 인터페이스를 쓰는 쪽(auth)이 아니라
// 여기 두는 이유: 구현이 셋이고(smtp·console·테스트 fake) 조립이 main.go 몫이라,
// 계약이 구현들과 같은 자리에 있는 편이 읽기 쉽다.
type Sender interface {
	Send(ctx context.Context, m Mail) error
}

// ErrRejected는 보내기 전에 우리가 거절한 것이다(네트워크 실패와 구분된다).
var ErrRejected = errors.New("mailer: 메일이 거절되었습니다")

// validate — 헤더 인젝션 차단 + 최소 필드 확인.
//
// CR/LF 검사는 To·Subject **양쪽 다** 해야 한다. Subject만 막는 구현을 종종 보는데,
// 주소 필드도 그대로 헤더로 나가므로 똑같이 뚫린다.
func (m Mail) validate() error {
	if strings.TrimSpace(m.To) == "" {
		return fmt.Errorf("%w: 수신자가 비어 있습니다", ErrRejected)
	}
	if strings.TrimSpace(m.Subject) == "" {
		return fmt.Errorf("%w: 제목이 비어 있습니다", ErrRejected)
	}
	if strings.TrimSpace(m.TextBody) == "" {
		return fmt.Errorf("%w: 본문(text)이 비어 있습니다", ErrRejected)
	}
	// 헤더가 되는 필드에 개행류가 있으면 거절한다. \r\n 뿐 아니라 낱개 \r·\n·NUL도 막는다 —
	// 일부 MTA가 낱개 개행을 CRLF로 정규화하면서 인젝션이 되살아난다.
	for _, f := range []struct{ name, val string }{{"수신자", m.To}, {"제목", m.Subject}} {
		if strings.ContainsAny(f.val, "\r\n\x00") {
			return fmt.Errorf("%w: %s에 허용되지 않는 문자가 있습니다(헤더 인젝션 방어)", ErrRejected, f.name)
		}
	}
	// 주소는 하나다. 쉼표로 여러 개를 넘기려는 시도를 여기서 끊는다.
	if strings.ContainsAny(m.To, ",;") {
		return fmt.Errorf("%w: 수신자는 한 명이어야 합니다", ErrRejected)
	}
	return nil
}

// SendAsync는 요청 경로를 막지 않고 보낸다.
//
// ⚠ **요청 ctx를 넘기지 않는다.** 이것이 이 함수가 존재하는 이유다 —
// `go func() { s.Send(ctx, m) }()` 로 쓰면 핸들러가 응답을 반환하는 순간 ctx가 취소되어
// 메일이 조용히 안 나간다(로그에는 context canceled만 남아 원인이 안 보인다).
// 그래서 여기서 배경 ctx에 자체 타임아웃을 새로 건다.
//
// 실패해도 호출자를 실패시키지 않는다 — 가입이 SMTP 지연에 묶이면 안 된다.
// 사용자는 재발송으로 복구하고, 토큰은 이미 DB에 있다(발급은 동기·발송은 비동기).
func SendAsync(s Sender, m Mail, timeout time.Duration) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		if err := s.Send(ctx, m); err != nil {
			// 주소 전체를 로그에 남기지 않는다 — 로그가 곧 수신자 목록이 되면 안 된다.
			slog.Error("[mailer] 발송 실패", "to", maskEmail(m.To), "subject", m.Subject, "err", err)
		}
	}()
}

// maskEmail — 로그용. 진단에 필요한 만큼만 남기고 가린다.
func maskEmail(addr string) string {
	at := strings.LastIndex(addr, "@")
	if at <= 0 {
		return "***"
	}
	local, domain := addr[:at], addr[at+1:]
	if len(local) <= 2 {
		return "**@" + domain
	}
	return local[:2] + strings.Repeat("*", len(local)-2) + "@" + domain
}

// ─────────────────────────────────────────────────────────────────────────────
// @plm SRS-027  발송 실패를 **보이게** 한다(2026-10-01 · auth-golive P0)
//
// 이 패키지는 실패해도 호출자를 실패시키지 않는다(SendAsync · 존재 노출 방지로 응답도 늘 성공).
// 그 설계는 옳지만 대가가 있었다 — 운영에서 Cloudflare 가 `550 Email sending is not enabled for
// domain` 으로 **모든 메일을 거절하는 동안** 앱은 「보냈다」고 답했고, 실패는 로그 한 줄로만
// 남아 **실사용자 가입 검증이 통째로 막힌 것을 아무도 몰랐다.** 그래서 두 장치를 둔다:
//
//	Observe — 실패를 받는 쪽(main.go 가 security_events 에 남긴다)에 넘긴다. 발송 동작은 그대로다
//	Prober  — 메일을 **보내지 않고** 발신 가능 여부를 본다(연결·TLS·AUTH·MAIL FROM 까지).
//	          이번 거절이 정확히 MAIL FROM 단계였다 — 부팅·배포 때 한 번 찔러 보면 첫 가입자보다 먼저 안다
// ─────────────────────────────────────────────────────────────────────────────

// Prober — 발신 가능 여부를 메일 없이 확인할 수 있는 구현이 갖는다(smtp). console 은 없다.
type Prober interface {
	Probe(ctx context.Context) error
}

// Probe — s 가 점검을 지원하면 돌리고 (true, 결과)를, 아니면 (false, nil)을 돌려준다.
func Probe(ctx context.Context, s Sender) (bool, error) {
	p, ok := s.(Prober)
	if !ok {
		return false, nil
	}
	return true, p.Probe(ctx)
}

// Observe — 발송 실패를 onFail 에 넘기는 Sender 를 돌려준다.
//
// 우리가 보내기 전에 거절한 것(ErrRejected — 헤더 인젝션 방어 등)은 넘기지 않는다. 그것은
// 발신 경로 고장이 아니라 입력 문제라, 섞으면 경보가 잡음이 된다.
// 감싼 뒤에도 Probe 가 그대로 닿아야 한다 — 그래서 observed 가 Prober 를 위임한다.
func Observe(s Sender, onFail func(m Mail, err error)) Sender {
	if onFail == nil {
		return s
	}
	return observed{inner: s, onFail: onFail}
}

type observed struct {
	inner  Sender
	onFail func(Mail, error)
}

func (o observed) Send(ctx context.Context, m Mail) error {
	err := o.inner.Send(ctx, m)
	if err != nil && !errors.Is(err, ErrRejected) {
		o.onFail(m, err)
	}
	return err
}

func (o observed) Probe(ctx context.Context) error {
	if p, ok := o.inner.(Prober); ok {
		return p.Probe(ctx)
	}
	return nil
}

// MaskRecipient — 기록용. 받는 사람은 **도메인만** 남긴다(gmail·hanmail 별 실패 경향은 보되
// 누가 가입하려 했는지는 남기지 않는다 — security_events 의 PII 원값 금지 계약).
func MaskRecipient(addr string) string {
	at := strings.LastIndex(addr, "@")
	if at < 0 || at == len(addr)-1 {
		return "@?"
	}
	return addr[at:]
}

// ─────────────────────────────────────────────────────────────────────────────
// @plm SRS-027  받는 사람 × 메일 종류별 발신 상한(auth-golive P1 · SRS-027 「발신 한도」)
//
// 쿨다운(60초)만으로는 **하루 내내** 같은 주소로 보낼 수 있었다. 게다가 소셜 전용 계정의 「로그인 방법
// 안내」는 토큰을 만들지 않아 **쿨다운조차 없었다** — 운영은 per-IP 제한까지 꺼져 있어(터널 IP 공유)
// 남의 메일함을 우리 도메인으로 무한히 채울 수 있었다.
//
// ⚠ 키를 **종류별로** 나눈다. 받는 사람 하나로만 묶으면 공격자가 값싼 메일(잠금 알림 등)로 상한을
//   채워 진짜 주인의 재설정 메일을 하루 동안 막는다(복구 DoS). 종류는 제목으로 가른다 — 템플릿마다
//   제목이 하나로 고정돼 있다(template.go). 키에는 주소 원문을 넣지 않는다(해시).
// 걸리면 **조용히 안 보낸다**(nil) — 호출자 응답은 이미 존재 노출 방지로 동일하고, 실패로 세지도 않는다.
// ─────────────────────────────────────────────────────────────────────────────

// Capped — hit(key)가 거절하면 보내지 않는 Sender. onCap 은 거절될 때마다 불린다(n = 이번까지 센 수).
func Capped(s Sender, hit func(ctx context.Context, key string) (int64, bool), onCap func(m Mail, n int64)) Sender {
	if hit == nil {
		return s
	}
	return capped{inner: s, hit: hit, onCap: onCap}
}

type capped struct {
	inner Sender
	hit   func(context.Context, string) (int64, bool)
	onCap func(Mail, int64)
}

func (c capped) Send(ctx context.Context, m Mail) error {
	if n, ok := c.hit(ctx, CapKey(m)); !ok {
		if c.onCap != nil {
			c.onCap(m, n)
		}
		return nil
	}
	return c.inner.Send(ctx, m)
}

func (c capped) Probe(ctx context.Context) error {
	if p, ok := c.inner.(Prober); ok {
		return p.Probe(ctx)
	}
	return nil
}

// CapKey — "mailcap:<받는사람 해시>:<종류 해시>". 대소문자·앞뒤 공백이 달라도 같은 주소다.
func CapKey(m Mail) string {
	to := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(m.To))))
	kind := sha256.Sum256([]byte(m.Subject))
	return "mailcap:" + hex.EncodeToString(to[:8]) + ":" + hex.EncodeToString(kind[:4])
}
