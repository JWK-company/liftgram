package oauth

import (
	"net/http"
	"time"
)

// newHTTPClient — 프로바이더 어댑터가 공유하는 아웃바운드 HTTP 클라이언트.
// 토큰 교환·사용자 조회 왕복의 상한(10s)을 한 곳에서 정한다(종전 6곳 복붙).
func newHTTPClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Second}
}
