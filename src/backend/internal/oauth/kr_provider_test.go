// @plm SRS-052  카카오·네이버 응답 파싱 — 픽스처 주도 (P4)
//
// 여기서 지키는 것은 **이메일을 언제 신뢰하는가** 하나다. 그 판정이 틀리면 남의 계정에 붙는다.
// 그래서 "된다"보다 **"이 응답으로는 신뢰하지 않는다"** 를 세는 테스트가 대부분이다.
package oauth

import (
	"encoding/json"
	"fmt"
	neturl "net/url"
	"strings"
	"testing"
)

// ── 카카오 레거시 3플래그 — 8종 전건 ────────────────────────────────────────
//
// has_email ∧ is_email_valid ∧ is_email_verified 가 **전부 참일 때만** 신뢰한다(D25).
// is_email_verified 만 보면 `is_email_valid=false`(= 그 주소가 다른 카카오계정으로 넘어가
// 만료됨)인 경우에 **남의 주소로 연결**된다.
func Test카카오_3플래그_8종(t *testing.T) {
	b := func(v bool) string {
		if v {
			return "true"
		}
		return "false"
	}
	for i := range 8 {
		hasEmail, valid, verified := i&4 != 0, i&2 != 0, i&1 != 0
		want := hasEmail && valid && verified
		name := fmt.Sprintf("has=%v/valid=%v/verified=%v", hasEmail, valid, verified)

		t.Run(name, func(t *testing.T) {
			raw := []byte(`{"id":123456789,"kakao_account":{` +
				`"email":"user@kakao.com",` +
				`"has_email":` + b(hasEmail) + `,` +
				`"is_email_valid":` + b(valid) + `,` +
				`"is_email_verified":` + b(verified) + `,` +
				`"profile":{"nickname":"카카오사용자"}}}`)
			p, err := parseKakaoLegacy(raw)
			if err != nil {
				t.Fatal(err)
			}
			if p.EmailVerified != want {
				t.Fatalf("EmailVerified=%v, 원함 %v", p.EmailVerified, want)
			}
			// 보증되지 않으면 주소 자체를 싣지 않는다 — 마스킹 주소가 화면에 새면
			// 사용자가 자기 주소로 착각한다.
			if !want && p.Email != "" {
				t.Fatalf("보증 안 된 주소가 실렸다: %q", p.Email)
			}
			if want && p.Email != "user@kakao.com" {
				t.Fatalf("Email=%q", p.Email)
			}
		})
	}
}

// ★ 동의하지 않은 항목은 **키 자체가 빠진다.** bool 로 받으면 "미동의"가 조용히 false 가 되고,
// 그 자체는 안전한 쪽이지만 — 여기서 확인하는 것은 **빠져도 신뢰로 넘어가지 않는다**는 것이다.
func Test카카오_플래그가_아예_없으면_신뢰하지_않는다(t *testing.T) {
	raw := []byte(`{"id":42,"kakao_account":{"email":"user@kakao.com","profile":{"nickname":"닉"}}}`)
	p, err := parseKakaoLegacy(raw)
	if err != nil {
		t.Fatal(err)
	}
	if p.EmailVerified {
		t.Fatal("플래그가 없는데 검증됨으로 읽었다")
	}
	if p.Email != "" {
		t.Fatalf("주소가 실렸다: %q", p.Email)
	}
}

// ★★ D16′ — 큰 회원번호가 **지수 표기로 뭉개지지 않는다.**
// `any`(→float64) 로 받으면 1.23456789012345e+15 가 되고, 그 값이 provider_user_id 로
// 저장되면 재로그인 때 같은 사람을 못 알아본다.
func Test카카오_큰_회원번호가_원문_그대로다(t *testing.T) {
	for _, id := range []string{"1234567890123456", "9007199254740993", "42"} {
		t.Run(id, func(t *testing.T) {
			raw := []byte(`{"id":` + id + `,"kakao_account":{"profile":{"nickname":"닉"}}}`)
			p, err := parseKakaoLegacy(raw)
			if err != nil {
				t.Fatal(err)
			}
			if p.ProviderUserID != id {
				t.Fatalf("ProviderUserID=%q, 원함 %q", p.ProviderUserID, id)
			}
			if strings.ContainsAny(p.ProviderUserID, "eE.+") {
				t.Fatalf("지수 표기로 뭉개졌다: %q", p.ProviderUserID)
			}
		})
	}
}

// 대조군 — float64 를 거치면 실제로 깨진다는 것을 여기서 보여 둔다.
// 이게 없으면 위 테스트가 "원래 안 깨지는 것"을 확인하는 셈이 되어 아무것도 지키지 않는다.
func Test대조군_float64를_거치면_실제로_깨진다(t *testing.T) {
	var v any
	if err := json.Unmarshal([]byte(`{"id":1234567890123456}`), &v); err != nil {
		t.Fatal(err)
	}
	got := fmt.Sprintf("%v", v.(map[string]any)["id"])
	if !strings.ContainsAny(got, "eE") {
		t.Skipf("이 런타임에서는 지수 표기가 안 난다(%s) — 테스트의 전제만 확인한다", got)
	}
	t.Logf("float64 경로에서는 %s 가 된다 — UseNumber 가 이것을 막는다", got)
}

// 카카오도 두 형태를 받는다 — 제공자가 표현을 바꿔도 견디게(네이버에서 실제로 물렸다).
func Test카카오_식별자_두_형태(t *testing.T) {
	for _, tc := range []struct{ raw, want string }{
		{`"id":1234567890123456`, "1234567890123456"},
		{`"id":"1234567890123456"`, "1234567890123456"},
	} {
		t.Run(tc.want, func(t *testing.T) {
			p, err := parseKakaoLegacy([]byte(`{` + tc.raw + `,"kakao_account":{"profile":{"nickname":"닉"}}}`))
			if err != nil {
				t.Fatal(err)
			}
			if p.ProviderUserID != tc.want {
				t.Fatalf("ProviderUserID=%q, 원함 %q", p.ProviderUserID, tc.want)
			}
		})
	}
}

func Test카카오_회원번호가_없으면_거절한다(t *testing.T) {
	for _, raw := range []string{`{"kakao_account":{}}`, `{"id":0,"kakao_account":{}}`} {
		if _, err := parseKakaoLegacy([]byte(raw)); err == nil {
			t.Fatalf("앵커가 없는데 통과했다: %s", raw)
		}
	}
}

// ── 네이버 ─────────────────────────────────────────────────────────────────

// ★★ D15′ 회귀 — 네이버 응답에 **무엇이 오든** EmailVerified 는 false 다.
//
//	이 테스트가 실패한다는 것은 누군가 그 상수를 조건식으로 바꿨다는 뜻이고,
//	그 순간 "피해자 주소를 자기 연락처로 적어 두기"만으로 계정이 넘어간다.
func Test네이버는_무엇이_와도_보증하지_않는다(t *testing.T) {
	for _, extra := range []string{
		``,
		`,"email_verified":true`,
		`,"email_verified":"true"`,
		`,"verified":true`,
		`,"is_email_verified":true`,
	} {
		t.Run("extra="+extra, func(t *testing.T) {
			raw := []byte(`{"resultcode":"00","message":"success","response":{` +
				`"id":"32742776","email":"user@naver.com","nickname":"네이버사용자"` + extra + `}}`)
			p, err := parseNaver(raw)
			if err != nil {
				t.Fatal(err)
			}
			if p.EmailVerified {
				t.Fatal("★ 네이버 이메일을 보증했다 — 방향 B 탈취가 열린다(D15′)")
			}
			// 주소는 **싣는다.** 판정 엔진이 소유 증명 대상 주소로 쓴다(카카오와 다른 점 —
			// 카카오의 미보증 주소는 마스킹돼 오지만 네이버 주소는 실주소다).
			if p.Email != "user@naver.com" {
				t.Fatalf("Email=%q — 소유 증명을 보낼 주소가 사라졌다", p.Email)
			}
		})
	}
}

// 네이버 id 는 앱 생성 시기에 따라 문자열이거나 숫자다. 둘 다 원문 그대로 보존돼야 한다.
func Test네이버_식별자_두_형태(t *testing.T) {
	for _, tc := range []struct{ raw, want string }{
		{`"id":"AAAAAA-bbbbbb_cc11223344"`, "AAAAAA-bbbbbb_cc11223344"}, // 2021-05 이후 BASE64
		{`"id":32742776`, "32742776"},                                   // 그 전 앱의 INT64
	} {
		t.Run(tc.want, func(t *testing.T) {
			raw := []byte(`{"resultcode":"00","response":{` + tc.raw + `,"nickname":"닉"}}`)
			p, err := parseNaver(raw)
			if err != nil {
				t.Fatal(err)
			}
			if p.ProviderUserID != tc.want {
				t.Fatalf("ProviderUserID=%q, 원함 %q", p.ProviderUserID, tc.want)
			}
		})
	}
}

// ★ HTTP 200 인데 본문이 실패인 경우 — 상태 코드만 보면 빈 프로필로 진행한다.
func Test네이버_본문_실패는_HTTP200이라도_거절한다(t *testing.T) {
	raw := []byte(`{"resultcode":"024","message":"Authentication failed","response":{}}`)
	if _, err := parseNaver(raw); err == nil {
		t.Fatal("resultcode 실패가 통과했다")
	}
}

func Test네이버_닉네임이_없으면_이름으로_떨어진다(t *testing.T) {
	raw := []byte(`{"resultcode":"00","response":{"id":"x1","name":"홍길동"}}`)
	p, err := parseNaver(raw)
	if err != nil {
		t.Fatal(err)
	}
	if p.DisplayName != "홍길동" {
		t.Fatalf("DisplayName=%q", p.DisplayName)
	}
}

// ── 인가 URL — 제공자별 요구가 지켜지는가 ──────────────────────────────────

func Test인가URL_제공자별_요구(t *testing.T) {
	cfg := ProviderConfig{ClientID: "cid", ClientSecret: "secret"}
	for _, tc := range []struct {
		name      string
		p         Provider
		wantScope string
	}{
		{"kakao-oidc", NewKakao(cfg, false), "openid"},
		{"kakao-legacy", NewKakao(cfg, true), ""}, // 동의항목이 콘솔에서 정해진다
		{"naver", NewNaver(cfg), "openid"},        // OIDC 경로는 openid 필수
	} {
		t.Run(tc.name, func(t *testing.T) {
			u := tc.p.AuthorizeURL("st", "ch", "http://localhost:3000/cb")
			if got := queryOf(t, u, "scope"); got != tc.wantScope {
				t.Fatalf("scope=%q, 원함 %q", got, tc.wantScope)
			}
			if queryOf(t, u, "code_challenge") != "ch" ||
				queryOf(t, u, "code_challenge_method") != "S256" {
				t.Fatalf("PKCE 파라미터가 없다: %s", u)
			}
			// ⚠ client_secret 이 인가 URL 에 실리면 브라우저 주소창·리퍼러·접근 로그에 남는다.
			if strings.Contains(u, "secret") {
				t.Fatalf("★ client_secret 이 인가 URL 에 실렸다: %s", u)
			}
		})
	}
}

func queryOf(t *testing.T, rawURL, key string) string {
	t.Helper()
	u, err := neturl.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	return u.Query().Get(key)
}
