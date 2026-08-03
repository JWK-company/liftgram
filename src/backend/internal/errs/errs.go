// @plm SRS-001  도메인 오류 — 특정 도메인에 얹히지 않는 공통 타입
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 여기 있나: 오류 타입이 특정 도메인 패키지 안에 있으면 **그 도메인을 걷어낼 때 전부 깨진다**.
// 이 템플릿의 전제가 "레퍼런스를 지우고 시작하라"이므로, 공통 convention은 도메인 밖에 둔다.
//
// 이 타입은 **전송 계층을 모른다** — connect도 http도 import하지 않는다.
// 그래서 규칙을 테스트할 때 서버를 띄울 필요가 없고, RPC·WebSocket 어느 쪽에서도 같은 답을 준다.
// 코드→전송 오류 매핑은 middleware/errors.go 한 곳에서만 한다.
// ─────────────────────────────────────────────────────────────────────────────
package errs

import "fmt"

type Code string

const (
	NotFound   Code = "not_found"
	Conflict   Code = "conflict"
	Validation Code = "validation"
	// 신원이 없거나(토큰 없음·만료) 자격이 틀렸다. "누구인지 모르겠다"이지
	// "너는 이걸 할 수 없다"(Forbidden)가 아니다 — 화면이 로그인을 띄울 신호로 쓴다.
	Unauthorized Code = "unauthorized"
	// 신원은 확인됐지만 권한이 없다(모더레이터 전용 등).
	Forbidden Code = "forbidden"
	// **우리 잘못이 아니다** — 우리가 의존하는 바깥(외부 API 등)이 지금 대답하지 않는다.
	// Internal과 갈라 두는 이유: 화면이 "다시 시도"를 권할 수 있는 실패는 이것뿐이다.
	Unavailable Code = "unavailable"
)

// DomainError는 도메인이 실패를 표현하는 유일한 방법이다.
// 새 실패 종류가 필요하면 위 Code에 추가하고 middleware/errors.go의 매핑에도 한 줄 더한다.
type DomainError struct {
	Code    Code
	Message string
}

func (e *DomainError) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

func New(code Code, format string, args ...any) *DomainError {
	return &DomainError{Code: code, Message: fmt.Sprintf(format, args...)}
}
