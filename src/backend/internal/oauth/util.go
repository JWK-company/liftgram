// @plm SRS-052  OAuth 보조 — 비교·클라이언트 IP·인코딩 (P3)
package oauth

import (
	"crypto/subtle"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// constantTimeEqual — state 대조. 길이가 다르면 즉시 false 지만,
// 같은 길이에서는 상수시간이라 위조 시도에 타이밍 힌트를 주지 않는다.
func constantTimeEqual(a, b string) bool {
	if len(a) != len(b) || a == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func urlQueryEscape(s string) string { return url.QueryEscape(s) }

// clientIP — per-IP 한도와 토큰 발급 시점 스냅샷용.
//
// ⚠ x-forwarded-for 는 **신뢰할 수 있는 프록시가 앞에 있을 때만** 의미가 있다.
//
//	이 저장소는 프론트 프록시가 항상 앞에 있으므로 첫 항목을 쓰되, 값이 없으면 RemoteAddr 로
//	떨어진다. (auth.clientIP 와 같은 논리 — 그쪽은 unexported 라 여기 최소 복제한다.)
func clientIP(r *http.Request) string {
	if v := r.Header.Get("x-forwarded-for"); v != "" {
		if i := strings.IndexByte(v, ','); i > 0 {
			v = v[:i]
		}
		if ip := strings.TrimSpace(v); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
