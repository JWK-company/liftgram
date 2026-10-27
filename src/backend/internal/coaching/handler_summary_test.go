// @plm SRS-080  계약 경계 — 본문 상한 256KB · 응답 no-store (S-6·S-20)
package coaching

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"

	coachingv1 "github.com/JWK-company/liftgram/src/backend/gen/coaching/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/coaching/v1/coachingv1connect"
)

func postJSON(t *testing.T, srv *httptest.Server, path string, body []byte) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, srv.URL+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func connectCode(t *testing.T, res *http.Response) string {
	t.Helper()
	defer res.Body.Close()
	var e struct{ Code string }
	_ = json.NewDecoder(res.Body).Decode(&e)
	return e.Code
}

func TestHandler_본문_256KB_를_넘으면_읽기_전에_거부(t *testing.T) {
	repo := newRepo()
	svc, _, _ := summarySvc(repo)
	_, h := coachingv1connect.NewCoachingServiceHandler(NewHandler(svc), connect.WithReadMaxBytes(ReadMaxBytes))
	srv := httptest.NewServer(h)
	defer srv.Close()
	method := coachingv1connect.CoachingServiceSendProgressSummaryProcedure

	big, _ := json.Marshal(map[string]any{"snapshotJson": strings.Repeat("x", ReadMaxBytes+1)})
	if code := connectCode(t, postJSON(t, srv, method, big)); code != "resource_exhausted" {
		t.Fatalf("256KB 초과는 resource_exhausted: %q", code)
	}
	// 64KB 스냅샷은 상한 안이다 — 본문은 읽히고 서비스까지 간다(여기선 로그인이 없어 서비스가 거절한다.
	// 오류 변환 인터셉터를 끼우지 않았으므로 코드는 unknown — 중요한 것은 resource_exhausted 가 아니라는 것).
	ok, _ := json.Marshal(map[string]any{"snapshotJson": strings.Repeat("x", 64<<10)})
	if code := connectCode(t, postJSON(t, srv, method, ok)); code == "resource_exhausted" || code == "" {
		t.Fatalf("상한 안이면 본문을 읽고 다음 단계로 가야 한다: %q", code)
	}
}

func TestNoStore_응답에_캐시_금지(t *testing.T) {
	res := noStore(connect.NewResponse(&coachingv1.GetProgressSummaryResponse{}))
	if got := res.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q", got)
	}
}
