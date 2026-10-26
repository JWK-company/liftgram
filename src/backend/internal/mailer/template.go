// @plm SRS-052  메일 본문 조립 — MIME 인코딩과 계정 메일 문안 (booktarae mailer/template.go에서 옮겼다)
//
// ── 링크는 APP_URL에서만 나온다 ─────────────────────────────────────────────
// 요청 Host 헤더로 링크를 만들지 않는다. 그것이 password-reset poisoning의 통로다 —
// 공격자가 Host를 자기 도메인으로 바꿔 요청하면 피해자에게 **공격자 도메인이 박힌 재설정 링크**가
// 발송된다. 설정값 고정은 그 공격을 원천 차단한다.
//
// ── 문안 규칙 ───────────────────────────────────────────────────────────────
// 계정 메일은 계정 존재를 누설하지 않는 범위에서 친절해야 한다. 제공자가 준 표시 이름 같은
// **외부 문자열을 본문에 넣지 않는다** — 넣어야 한다면 이스케이프한다.
package mailer

import (
	"encoding/base64"
	"fmt"
	"mime"
	"net/url"
	"strings"
)

// Templates는 링크 기준 주소를 들고 각 목적의 Mail을 만든다.
type Templates struct {
	appURL string // 끝 슬래시 없는 절대 URL
}

// NewTemplates — appURL 이 없으면 여기서 거절한다(필요한 쪽이 요구해야 무관한 실행 단위가 볼모가 되지 않는다).
func NewTemplates(appURL string) (*Templates, error) {
	v := strings.TrimRight(strings.TrimSpace(appURL), "/")
	if v == "" {
		return nil, fmt.Errorf("mailer: APP_URL이 비어 있습니다 — 메일 링크와 OAuth redirect_uri의 기준 주소입니다")
	}
	if !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
		return nil, fmt.Errorf("mailer: APP_URL은 http(s):// 로 시작하는 절대 URL이어야 합니다 (받은 값: %q)", appURL)
	}
	return &Templates{appURL: v}, nil
}

func (t *Templates) link(path, token string) string {
	return fmt.Sprintf("%s%s?token=%s", t.appURL, path, url.QueryEscape(token))
}

// Verify — 가입 주소 확인.
func (t *Templates) Verify(to, token string) Mail {
	u := t.link("/verify-email", token)
	const lead = "확인 전에도 운동은 기록할 수 있지만, 피드·DM 같은 소셜 기능은 확인 후에 이용할 수 있어요."
	const foot = "이 링크는 24시간 뒤 만료됩니다. 본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다."
	return Mail{
		To:       to,
		Subject:  "[Liftgram] 이메일 주소를 확인해 주세요",
		TextBody: "아래 주소를 열어 이메일 확인을 마쳐 주세요.\n\n" + u + "\n\n" + lead + "\n" + foot + "\n",
		HTMLBody: htmlWrap("이메일 주소를 확인해 주세요", lead, "이메일 확인하기", u, foot),
	}
}

// PasswordReset — 비밀번호 재설정(30분·1회).
func (t *Templates) PasswordReset(to, token string) Mail {
	u := t.link("/reset", token)
	const lead = "이 링크는 30분 뒤 만료되며 한 번만 사용할 수 있어요. 재설정을 마치면 로그인된 모든 기기에서 로그아웃됩니다."
	const foot = "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다 — 비밀번호는 바뀌지 않습니다."
	return Mail{
		To:       to,
		Subject:  "[Liftgram] 비밀번호 재설정",
		TextBody: "아래 주소에서 새 비밀번호를 설정할 수 있어요.\n\n" + u + "\n\n" + lead + "\n" + foot + "\n",
		HTMLBody: htmlWrap("비밀번호 재설정", lead, "새 비밀번호 설정하기", u, foot),
	}
}

// SocialOnly — 소셜로만 가입된 주소로 재설정 요청이 왔을 때.
//
// ⚠ 이 안내를 **화면이 아니라 메일로** 한다. 화면에 "구글로 가입된 계정입니다"를 띄우면 그 주소의
// 가입 사실과 제공자를 아무에게나 알려 주는 것이 된다. 메일은 그 주소의 주인만 읽는다.
func (t *Templates) SocialOnly(to, providerLabel string) Mail {
	lead := fmt.Sprintf("이 주소는 %s 계정으로 로그인하도록 설정되어 있어요. 비밀번호를 함께 쓰고 싶다면 로그인한 뒤 계정 화면에서 추가할 수 있어요.", htmlEscape(providerLabel))
	return Mail{
		To:      to,
		Subject: "[Liftgram] 로그인 방법 안내",
		TextBody: fmt.Sprintf("이 주소는 %s 계정으로 로그인하도록 설정되어 있어요.\n\n%s/account 에서 %s 버튼으로 로그인해 주세요.\n"+
			"비밀번호를 함께 쓰고 싶다면 로그인한 뒤 계정 화면에서 추가할 수 있어요.\n본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.\n",
			providerLabel, t.appURL, providerLabel),
		HTMLBody: htmlWrap("로그인 방법 안내", lead, "로그인하러 가기", t.appURL+"/account", "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다."),
	}
}

// PasswordChanged — 변경·재설정 완료 통지. 탈취를 사용자가 알아챌 유일한 경로다.
func (t *Templates) PasswordChanged(to string) Mail {
	return Mail{
		To:      to,
		Subject: "[Liftgram] 비밀번호가 변경되었습니다",
		TextBody: "계정의 비밀번호가 방금 변경되었습니다.\n\n본인이 변경한 것이 아니라면 즉시 비밀번호를 재설정해 주세요:\n" +
			t.appURL + "/forgot\n",
		HTMLBody: htmlWrap("비밀번호가 변경되었습니다", "계정의 비밀번호가 방금 변경되었습니다.",
			"본인이 아니라면 즉시 재설정하기", t.appURL+"/forgot", "본인이 변경한 것이라면 이 메일은 무시하셔도 됩니다."),
	}
}

// IdentityLinked — 새 로그인 수단이 연결됐음을 알린다(모르는 연결은 탈취 신호다).
func (t *Templates) IdentityLinked(to, providerLabel string) Mail {
	return Mail{
		To:      to,
		Subject: "[Liftgram] 새 로그인 수단이 연결되었습니다",
		TextBody: fmt.Sprintf("계정에 %s 로그인이 연결되었습니다.\n\n본인이 아니라면 즉시 비밀번호를 재설정해 주세요:\n%s/forgot\n",
			providerLabel, t.appURL),
		HTMLBody: htmlWrap("새 로그인 수단이 연결되었습니다", fmt.Sprintf("계정에 %s 로그인이 연결되었습니다.", htmlEscape(providerLabel)),
			"본인이 아니라면 즉시 재설정하기", t.appURL+"/forgot", "본인이 연결한 것이라면 이 메일은 무시하셔도 됩니다."),
	}
}

// ── MIME ────────────────────────────────────────────────────────────────────

// buildMIME — 헤더 + 본문. 한국어가 들어가므로 인코딩이 필수다.
//
// ⚠ 제목은 RFC 2047로 인코딩한다. 날것의 UTF-8 제목은 서버·클라이언트에 따라
//
//	깨지거나(모지바케) 헤더 파싱에서 잘린다.
//
// ⚠ 본문은 base64로 싣는다. 8bit 그대로 보내면 7bit만 받는 중계 서버에서 손상된다.
func buildMIME(from string, m Mail) []byte {
	var b strings.Builder
	b.WriteString("From: " + encodeAddressHeader(from) + "\r\n")
	b.WriteString("To: " + m.To + "\r\n")
	b.WriteString("Subject: " + mime.BEncoding.Encode("UTF-8", m.Subject) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	// 자동 응답(부재중 등)이 인증 메일에 답장하지 않게 한다.
	b.WriteString("Auto-Submitted: auto-generated\r\n")

	if m.HTMLBody == "" {
		b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
		b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrap76(base64.StdEncoding.EncodeToString([]byte(m.TextBody))))
		return []byte(b.String())
	}

	// 텍스트와 HTML을 함께 싣는다 — 클라이언트가 고른다.
	const boundary = "lg-mail-boundary-7d41e0"
	b.WriteString("Content-Type: multipart/alternative; boundary=\"" + boundary + "\"\r\n\r\n")
	for _, part := range []struct{ ctype, body string }{
		{"text/plain; charset=UTF-8", m.TextBody},
		{"text/html; charset=UTF-8", m.HTMLBody},
	} {
		b.WriteString("--" + boundary + "\r\n")
		b.WriteString("Content-Type: " + part.ctype + "\r\n")
		b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrap76(base64.StdEncoding.EncodeToString([]byte(part.body))))
		b.WriteString("\r\n")
	}
	b.WriteString("--" + boundary + "--\r\n")
	return []byte(b.String())
}

// encodeAddressHeader — "이름 <주소>"의 이름 부분만 RFC 2047로 인코딩한다.
// 주소는 ASCII라 그대로 두어야 하며, 통째로 인코딩하면 주소가 깨진다.
func encodeAddressHeader(from string) string {
	i := strings.LastIndex(from, "<")
	if i <= 0 {
		return from
	}
	name := strings.TrimSpace(from[:i])
	return mime.BEncoding.Encode("UTF-8", name) + " " + from[i:]
}

// wrap76 — base64를 76자마다 접는다(RFC 2045). 접지 않으면 긴 줄을 거부하는 서버가 있다.
func wrap76(s string) string {
	var b strings.Builder
	for len(s) > 76 {
		b.WriteString(s[:76])
		b.WriteString("\r\n")
		s = s[76:]
	}
	b.WriteString(s)
	b.WriteString("\r\n")
	return b.String()
}

func htmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return r.Replace(s)
}

// htmlWrap — 인증 메일 한 벌의 최소 HTML. 외부 자산을 부르지 않는다(추적 픽셀·CDN 없음).
func htmlWrap(title, lead, cta, href, footer string) string {
	return `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#0e1116;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#171717">` +
		`<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">` +
		`<h1 style="margin:0 0 12px;font-size:18px">` + htmlEscape(title) + `</h1>` +
		`<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#525252">` + lead + `</p>` +
		`<a href="` + htmlEscape(href) + `" style="display:inline-block;background:#4c8dff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500">` +
		htmlEscape(cta) + `</a>` +
		`<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#a3a3a3">` + htmlEscape(footer) + `</p>` +
		`<p style="margin:12px 0 0;font-size:12px;color:#a3a3a3;word-break:break-all">` + htmlEscape(href) + `</p>` +
		`</div></body></html>`
}
