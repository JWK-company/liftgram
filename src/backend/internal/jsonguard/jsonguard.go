// @plm SRS-080 SRS-006  JSON 을 Postgres jsonb 에 넣기 전에 — 펼치면 커지는 숫자·짝 없는 서로게이트를 막는다
//
// ─────────────────────────────────────────────────────────────────────────────
// Postgres jsonb 는 숫자를 numeric 으로 저장한다. `1e130000`은 몇 바이트로 저장되지만 **글로 내보낼 때**
// (pgx 바이너리 형식도 jsonb_send 가 글을 만든다) 13만 자리로 펼쳐진다. 64KB 입력이 1GB 가까운 응답이 되어
// 서버가 메모리를 다 쓴다(/qa code CS-1 실측: 64KB → 910MB). `0e-99999`처럼 값이 0이어도 소수 자릿수(dscale)가
// 남아 같은 일이 난다. 그래서 **글자 모양**으로 막는다 — 값만 보면(ParseFloat) 0·작은 수가 빠져나간다:
//
//	· 숫자 글자 길이 ≤ 32   — JS 의 가장 긴 왕복 표기(`-1.2345678901234567e-123`)도 24자다
//	· 지수(e/E 뒤) |값| ≤ 30 — 펼친 글이 숫자 하나에 ~64자를 넘지 않는다. JS 는 1e21 이상·1e-7 미만에서만 지수를 쓰고,
//	                          부동소수 찌꺼기(5.551115123125783e-17)도 이 안이다
//	· float64 로 유한       — Inf·NaN 을 만들 수 없는 값
//	· (선택) |값| ≤ MaxAbs  — 스냅샷처럼 값의 뜻을 아는 곳만 건다(kg·횟수·ms → 1e15)
//
// 짝 없는 서로게이트(`\ud800`): Go 는 받아(U+FFFD 로 읽는다) Postgres 는 거부한다 → 500. 문자열 안의 `\uXXXX`만
// 보면 된다 — 날 UTF-8 바이트로는 서로게이트를 쓸 수 없다(올바르지 않은 UTF-8 은 proto 문자열 단계에서 막힌다).
//
// 입력은 **이미 올바른 JSON**이어야 한다(부르는 쪽이 json.Valid·Unmarshal 뒤에 부른다). 문법 검사기가 아니다 —
// 바이트를 한 번 훑으며 문자열을 건너뛰고 숫자 글자만 잰다. 할당이 없어 큰 동기 push 에도 싸다.
// ─────────────────────────────────────────────────────────────────────────────
package jsonguard

import (
	"errors"
	"fmt"
	"math"
	"strconv"
)

const (
	// MaxNumberLen은 숫자 글자 하나의 최대 길이다.
	MaxNumberLen = 32
	// MaxExponent는 지수 표기의 |지수| 상한이다.
	MaxExponent = 30
)

// Options는 검사 범위를 고른다. 영값 = 숫자 글자 모양만 본다.
type Options struct {
	// MaxAbs > 0 이면 |값| ≤ MaxAbs 도 본다.
	MaxAbs float64
	// RejectLoneSurrogates면 짝 없는 `\uD800-\uDFFF` 이스케이프를 거부한다.
	RejectLoneSurrogates bool
}

// ErrNumber·ErrSurrogate는 errors.Is 로 가를 수 있다(메시지는 부르는 쪽이 Validation 으로 감싼다).
var (
	ErrNumber    = errors.New("json number out of allowed range")
	ErrSurrogate = errors.New("json string has an unpaired surrogate escape")
)

// Check는 올바른 JSON b 를 훑어 위 규칙을 어기는 첫 자리를 오류로 돌려준다.
func Check(b []byte, opt Options) error {
	for i := 0; i < len(b); {
		c := b[i]
		switch {
		case c == '"':
			end, err := scanString(b, i+1, opt.RejectLoneSurrogates)
			if err != nil {
				return err
			}
			i = end
		case c == '-' || (c >= '0' && c <= '9'):
			j := i
			for j < len(b) && isNumberByte(b[j]) {
				j++
			}
			if err := checkNumber(b[i:j], opt.MaxAbs); err != nil {
				return err
			}
			i = j
		default:
			i++
		}
	}
	return nil
}

func isNumberByte(c byte) bool {
	return (c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E'
}

// checkNumber는 숫자 글자 하나를 본다.
func checkNumber(s []byte, maxAbs float64) error {
	if len(s) > MaxNumberLen {
		return fmt.Errorf("%w: number literal longer than %d characters", ErrNumber, MaxNumberLen)
	}
	for k, c := range s {
		if c != 'e' && c != 'E' {
			continue
		}
		exp := s[k+1:]
		if len(exp) > 0 && (exp[0] == '+' || exp[0] == '-') {
			exp = exp[1:]
		}
		// 앞자리 0 을 걷어낸 자릿수로 먼저 잰다 — `1e0000000000000000000005`도 길이 상한이 막지만 한 번 더.
		n := 0
		for _, d := range exp {
			n = n*10 + int(d-'0')
			if n > MaxExponent {
				return fmt.Errorf("%w: exponent beyond ±%d", ErrNumber, MaxExponent)
			}
		}
		break
	}
	v, err := strconv.ParseFloat(string(s), 64)
	if err != nil || math.IsInf(v, 0) || math.IsNaN(v) {
		return fmt.Errorf("%w: number is not a finite float64", ErrNumber)
	}
	if maxAbs > 0 && math.Abs(v) > maxAbs {
		return fmt.Errorf("%w: |number| greater than %g", ErrNumber, maxAbs)
	}
	return nil
}

// scanString은 여는 따옴표 다음(i)부터 닫는 따옴표 다음 자리를 돌려준다.
func scanString(b []byte, i int, surrogates bool) (int, error) {
	for i < len(b) {
		switch b[i] {
		case '"':
			return i + 1, nil
		case '\\':
			if i+1 < len(b) && b[i+1] == 'u' {
				r, ok := hex4(b, i+2)
				if surrogates && ok {
					switch {
					case r >= 0xD800 && r <= 0xDBFF: // 높은 쪽 — 바로 뒤에 낮은 쪽 `\uDC00-\uDFFF`가 와야 한다
						lo, ok2 := -1, false
						if i+7 < len(b) && b[i+6] == '\\' && b[i+7] == 'u' {
							lo, ok2 = hex4(b, i+8)
						}
						if !ok2 || lo < 0xDC00 || lo > 0xDFFF {
							return 0, ErrSurrogate
						}
						i += 12
						continue
					case r >= 0xDC00 && r <= 0xDFFF: // 앞에 높은 쪽 없이 온 낮은 쪽
						return 0, ErrSurrogate
					}
				}
				i += 6
				continue
			}
			i += 2
		default:
			i++
		}
	}
	return len(b), nil
}

func hex4(b []byte, i int) (int, bool) {
	if i+4 > len(b) {
		return 0, false
	}
	v := 0
	for _, c := range b[i : i+4] {
		var d int
		switch {
		case c >= '0' && c <= '9':
			d = int(c - '0')
		case c >= 'a' && c <= 'f':
			d = int(c-'a') + 10
		case c >= 'A' && c <= 'F':
			d = int(c-'A') + 10
		default:
			return 0, false
		}
		v = v<<4 | d
	}
	return v, true
}
