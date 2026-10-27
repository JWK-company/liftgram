// @plm SRS-080 SRS-006  숫자·서로게이트 검사 — 실제 기록 값은 받고, 펼치면 커지는 값만 막는다
package jsonguard

import (
	"errors"
	"strings"
	"testing"
)

func TestCheck_실제_기록_값은_받는다(t *testing.T) {
	// 개발 DB 실측(2026-10-27): 숫자 최대 13자(epoch ms 1.79e12) — 무게 소수·찌꺼기·음수·큰 정수까지 넉넉히.
	for _, s := range []string{
		`{"id":"w1","started_at":1793068086256,"weight_kg":102.5,"reps":10,"rir":-1,"done":true,"x":null}`,
		`{"a":0.30000000000000004,"b":5.551115123125783e-17,"c":1e21,"d":1.7976931348623157e+30}`,
		`{"a":9007199254740991,"b":-0,"c":0.0,"d":1E-7,"e":[1,2,[3.5e2]]}`,
		`{"s":"1e130000 은 글자라 괜찮다","t":"😀","u":"\\ud800 도 글자"}`,
		`[]`, `0`, `"x"`,
	} {
		if err := Check([]byte(s), Options{RejectLoneSurrogates: true}); err != nil {
			t.Errorf("%s → %v", s, err)
		}
	}
}

func TestCheck_펼치면_커지는_숫자는_거부(t *testing.T) {
	for _, s := range []string{
		`{"a":1e130000}`, `{"a":1e400}`, `{"a":1e31}`, `{"a":1E+31}`, `{"a":0e-99999}`, `{"a":1e-31}`,
		`{"a":5e-324}`, `{"a":1e0000000000000000000000000031}`,
		`{"a":1` + strings.Repeat("0", 40) + `}`,
		`{"a":0.` + strings.Repeat("0", 40) + `1}`,
		`[1,2,3,-1e99]`,
	} {
		if err := Check([]byte(s), Options{}); !errors.Is(err, ErrNumber) {
			t.Errorf("%s → %v (ErrNumber 이어야)", s, err)
		}
	}
}

func TestCheck_MaxAbs(t *testing.T) {
	opt := Options{MaxAbs: 1e15}
	if err := Check([]byte(`{"a":1e15,"b":-999999999999999}`), opt); err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{`{"a":1e20}`, `{"a":-1000000000000001}`, `{"a":1.5e15}`} {
		if err := Check([]byte(s), opt); !errors.Is(err, ErrNumber) {
			t.Errorf("%s → %v", s, err)
		}
	}
}

func TestCheck_짝_없는_서로게이트(t *testing.T) {
	opt := Options{RejectLoneSurrogates: true}
	for _, s := range []string{
		`{"x":"\ud800"}`, `{"x":"\uDBFFa"}`, `{"x":"\udc00"}`, `{"x":"a\ud800A"}`, `{"\ud800":1}`,
		`{"x":"\ud83d\ud83d"}`,
	} {
		if err := Check([]byte(s), opt); !errors.Is(err, ErrSurrogate) {
			t.Errorf("%s → %v", s, err)
		}
		if err := Check([]byte(s), Options{}); err != nil {
			t.Errorf("끄면 보지 않는다: %s → %v", s, err)
		}
	}
}
