// @plm SRS-006  access 토큰 서명·검증 — HMAC(HS256)
//
// 왜 대칭키(HMAC)인가: 토큰을 만드는 쪽과 검사하는 쪽이 **같은 서버**다. 비대칭키(RS256)는
// "남이 검증만 하게" 할 때 값어치가 있는데, 지금은 그런 상대가 없다. 키 하나면 운영이 단순하다.
//
// 서명 라이브러리를 쓰는 이유: 만료 확인·알고리즘 혼동(alg=none) 방어·상수시간 비교 같은 것들이
// 직접 짜면 틀리기 쉬운 자리다. 인증은 "직접 만들지 않는다"가 기본이다.
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// HMACSigner는 서버가 가진 비밀 하나로 서명하고 검증한다.
type HMACSigner struct {
	secret []byte
	now    func() time.Time
}

func NewHMACSigner(secret string) *HMACSigner {
	return &HMACSigner{secret: []byte(secret), now: time.Now}
}

type claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

func (s *HMACSigner) Sign(userID, role string, ttl time.Duration) (string, error) {
	now := s.now()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
		Role: role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	})
	return tok.SignedString(s.secret)
}

func (s *HMACSigner) Verify(token string) (string, string, error) {
	var c claims
	// **알고리즘을 못 박는다**(WithValidMethods). 이게 없으면 공격자가 alg를 바꿔 서명을 우회할 수 있다.
	_, err := jwt.ParseWithClaims(token, &c, func(*jwt.Token) (any, error) {
		return s.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return "", "", err
	}
	if c.Subject == "" {
		return "", "", errors.New("subject 없음")
	}
	return c.Subject, c.Role, nil
}
