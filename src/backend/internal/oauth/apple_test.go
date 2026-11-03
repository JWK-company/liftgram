// @plm SRS-028  Apple 어댑터 — 신뢰 경계·서명·이중형 파싱을 잠근다 (qa B1·H1·H2)
//
// 여기서 지키는 것은 "된다"보다 **"이 응답으로는 신뢰하지 않는다"** 다 — 무력화하면 빨개져야 한다.
package oauth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"strings"
	"testing"
	"time"
)

// 테스트용 EC 키 + 그 키를 실은 apple 어댑터.
func testApple(t *testing.T) (*apple, *ecdsa.PrivateKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	p, err := NewApple(AppleConfig{ServicesID: "ch.shoi.app", TeamID: "TEAM123", KeyID: "KEY123", PrivateKeyPEM: pemStr})
	if err != nil {
		t.Fatal(err)
	}
	return p.(*apple), key
}

// id_token 을 조립한다(서명은 우리가 검증하지 않으므로 아무 값이나). claims 만 실는다.
func makeIDToken(claims map[string]any) string {
	hb, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "x"})
	cb, _ := json.Marshal(claims)
	return base64.RawURLEncoding.EncodeToString(hb) + "." +
		base64.RawURLEncoding.EncodeToString(cb) + ".sig-not-verified"
}

// ── qa H1: client_secret 은 ES256 JWS(raw R‖S 64B), claims 정확 ──────────────
func TestApple_clientSecret_서명과_claim(t *testing.T) {
	a, key := testApple(t)
	now := time.Unix(1_700_000_000, 0)
	secret, err := a.clientSecret(now)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(secret, ".")
	if len(parts) != 3 {
		t.Fatalf("JWT 3세그먼트 아님: %d", len(parts))
	}
	// 서명 = raw R‖S 64바이트(DER 아님).
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		t.Fatal(err)
	}
	if len(sig) != 64 {
		t.Fatalf("서명이 64바이트가 아니다(DER 의심): %d", len(sig))
	}
	// 공개키로 검증되어야 한다.
	var r, s big.Int
	r.SetBytes(sig[:32])
	s.SetBytes(sig[32:])
	d := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(&key.PublicKey, d[:], &r, &s) {
		t.Fatal("공개키로 서명 검증 실패 — ES256 서명 인코딩이 틀렸다")
	}
	// header: alg=ES256, kid.
	hb, _ := base64.RawURLEncoding.DecodeString(parts[0])
	var h map[string]string
	_ = json.Unmarshal(hb, &h)
	if h["alg"] != "ES256" || h["kid"] != "KEY123" {
		t.Fatalf("header alg/kid 틀림: %v", h)
	}
	// claims: iss=TeamID, sub=ServicesID, aud=Apple, exp≤6개월.
	cb, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var c map[string]any
	_ = json.Unmarshal(cb, &c)
	if c["iss"] != "TEAM123" || c["sub"] != "ch.shoi.app" || c["aud"] != appleIssuer {
		t.Fatalf("claims 틀림: %v", c)
	}
	exp := int64(c["exp"].(float64))
	if exp <= now.Unix() || exp > now.Unix()+15_777_000 {
		t.Fatalf("exp 가 미래·6개월 이내가 아니다: %d", exp)
	}
}

// ── qa B1: 위조·타 client·만료 id_token 은 거부된다 ─────────────────────────
func TestApple_id_token_신뢰경계(t *testing.T) {
	a, _ := testApple(t)
	now := time.Unix(1_700_000_000, 0)

	// 정상.
	ok := makeIDToken(map[string]any{"iss": appleIssuer, "aud": "ch.shoi.app", "sub": "apple-sub-1", "exp": now.Unix() + 300, "email": "u@icloud.com", "email_verified": "true"})
	if p, err := a.profileFromIDToken(ok, now); err != nil || p.ProviderUserID != "apple-sub-1" || !p.EmailVerified {
		t.Fatalf("정상 토큰이 거부됨: %+v err=%v", p, err)
	}

	// aud 가 남의 client — 거부(위조 방지의 핵심).
	badAud := makeIDToken(map[string]any{"iss": appleIssuer, "aud": "attacker.app", "sub": "x", "exp": now.Unix() + 300})
	if _, err := a.profileFromIDToken(badAud, now); err == nil {
		t.Fatal("BLOCKER: 남의 aud 토큰이 통과했다 — 위조 id_token 으로 임의 계정 탈취 가능")
	}
	// iss 불일치 — 거부.
	badIss := makeIDToken(map[string]any{"iss": "https://evil.example", "aud": "ch.shoi.app", "sub": "x", "exp": now.Unix() + 300})
	if _, err := a.profileFromIDToken(badIss, now); err == nil {
		t.Fatal("iss 불일치 토큰이 통과했다")
	}
	// 만료 — 거부.
	expired := makeIDToken(map[string]any{"iss": appleIssuer, "aud": "ch.shoi.app", "sub": "x", "exp": now.Unix() - 1})
	if _, err := a.profileFromIDToken(expired, now); err == nil {
		t.Fatal("만료 토큰이 통과했다")
	}
	// sub 없음 — 거부(불변 앵커 부재).
	noSub := makeIDToken(map[string]any{"iss": appleIssuer, "aud": "ch.shoi.app", "exp": now.Unix() + 300})
	if _, err := a.profileFromIDToken(noSub, now); err == nil {
		t.Fatal("sub 없는 토큰이 통과했다")
	}
	// exp 부재 — 거부(서명검증 생략의 유일한 신선도 방어를 건너뛰지 않는다).
	noExp := makeIDToken(map[string]any{"iss": appleIssuer, "aud": "ch.shoi.app", "sub": "x"})
	if _, err := a.profileFromIDToken(noExp, now); err == nil {
		t.Fatal("exp 없는 토큰이 통과했다 — '안 만료되는 토큰'을 수용하면 안 된다")
	}

	// ── aud 가 **배열**로 오는 경우 (Apple 은 배열로 줄 수 있다) — 입력공간 절반의 사각지대를 메운다.
	arrOK := makeIDToken(map[string]any{"iss": appleIssuer, "aud": []string{"ch.shoi.app"}, "sub": "s", "exp": now.Unix() + 300})
	if p, err := a.profileFromIDToken(arrOK, now); err != nil || p.ProviderUserID != "s" {
		t.Fatalf("우리 client 를 담은 aud 배열이 거부됐다: %v", err)
	}
	arrMixed := makeIDToken(map[string]any{"iss": appleIssuer, "aud": []string{"attacker.app", "ch.shoi.app"}, "sub": "s", "exp": now.Unix() + 300})
	if _, err := a.profileFromIDToken(arrMixed, now); err != nil {
		t.Fatalf("우리 client 가 섞인 aud 배열이 거부됐다: %v", err)
	}
	arrBad := makeIDToken(map[string]any{"iss": appleIssuer, "aud": []string{"attacker.app", "other.app"}, "sub": "s", "exp": now.Unix() + 300})
	if _, err := a.profileFromIDToken(arrBad, now); err == nil {
		t.Fatal("BLOCKER: 우리 client 가 없는 aud 배열이 통과했다 — 배열 경로 탈취 가능")
	}
}

// ── qa H2: email_verified 의 bool|string 이중형 — 참은 좁게, 나머지는 false ──
func TestApple_email_verified_이중형(t *testing.T) {
	a, _ := testApple(t)
	now := time.Unix(1_700_000_000, 0)
	base := func(ev any) map[string]any {
		return map[string]any{"iss": appleIssuer, "aud": "ch.shoi.app", "sub": "s", "exp": now.Unix() + 300, "email": "u@privaterelay.appleid.com", "email_verified": ev}
	}
	cases := []struct {
		ev   any
		want bool
	}{
		{true, true}, {"true", true}, // 참은 이 둘뿐
		{false, false}, {"false", false}, {nil, false}, {"garbage", false},
	}
	for _, c := range cases {
		claims := base(c.ev)
		if c.ev == nil {
			delete(claims, "email_verified") // 키 부재
		}
		p, err := a.profileFromIDToken(makeIDToken(claims), now)
		if err != nil {
			t.Fatalf("ev=%v 인데 로그인이 에러로 죽었다: %v", c.ev, err)
		}
		if p.EmailVerified != c.want {
			t.Fatalf("ev=%v → EmailVerified=%v, 원함 %v (false→true 오독은 I-4 붕괴)", c.ev, p.EmailVerified, c.want)
		}
	}
}

// ── P-256 가드: 비-P256 EC 키는 부팅(NewApple)에서 거부 — 로그인 시점 패닉 방지(qa MED) ──
func TestApple_비P256키는_부팅에서_거부(t *testing.T) {
	k, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader) // ES256 이 아닌 곡선
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKCS8PrivateKey(k)
	pemStr := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	if _, err := NewApple(AppleConfig{ServicesID: "a", TeamID: "b", KeyID: "c", PrivateKeyPEM: pemStr}); err == nil {
		t.Fatal("P-384 키가 통과했다 — 첫 로그인에서 FillBytes 패닉이 난다(부팅에서 거부해야)")
	}
}

// filled() 는 4필드 전부.
func TestApple_filled_4필드(t *testing.T) {
	full := AppleConfig{ServicesID: "a", TeamID: "b", KeyID: "c", PrivateKeyPEM: "d"}
	if !full.filled() {
		t.Fatal("full 인데 filled=false")
	}
	if (AppleConfig{ServicesID: "a", TeamID: "b", KeyID: "c"}).filled() {
		t.Fatal("PEM 없는데 filled=true — 반쯤 설정된 apple 이 켜진다")
	}
}
