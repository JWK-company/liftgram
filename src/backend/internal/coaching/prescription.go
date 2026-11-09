// @plm SRS-043 @plm SRS-048  처방 정리 — 도메인(core)과 **같은 규칙**
//
// ─────────────────────────────────────────────────────────────────────────────
// 앱에도 같은 정리 함수가 있다(`core/src/domain/prescription.ts`). 그런데 서버에도 두는 이유는,
// **앱을 거치지 않고 들어오는 경로가 있기 때문**이다(직접 호출·옛 버전 앱·오작동).
// 회원 데이터를 고치는 요청이라 어느 문으로 들어오든 같은 규칙이 걸려야 한다.
//
// 값이 이상하면 **거절하지 않고 정리한다**. 처방 한 줄이 이상하다고 트레이너의 편집 전체를
// 되돌리면, 트레이너는 무엇이 문제인지 모른 채 다시 시도만 하게 된다.
//
// 두 곳의 규칙이 갈라지면 앱에서 보이는 것과 저장된 것이 달라진다 — 바꿀 때는 **양쪽을 함께** 고친다.
// ─────────────────────────────────────────────────────────────────────────────
package coaching

// RIR = 남길 여유 반복. 0(실패까지)~6(아주 여유) 밖의 값은 의미가 없다.
const (
	rirMin = 0
	rirMax = 6
	// 한 종목의 처방 줄 수 상한. 20세트를 넘기는 처방은 실수이거나 공격이다.
	maxPrescriptionRows = 20
)

// [원본] var validSetTypes = map[string]bool{"warmup": true, "top": true, "backoff": true, "normal": true, "drop": true}
// [개선] feeder(SPEC-041 — 탑 앞 준비 세트). 앱 core prescription.ts SET_TYPES 와 같다.
var validSetTypes = map[string]bool{"warmup": true, "top": true, "backoff": true, "normal": true, "drop": true, "feeder": true}

// 세트 방식(SPEC-041) — 앱 core prescription.ts SCHEME_IDS 와 같다.
var validSchemes = map[string]bool{"straight": true, "topBackoff": true, "fiveByFive": true, "pyramid": true, "reversePyramid": true, "dropSet": true}
var validLoadHints = map[string]bool{"light": true, "medium": true, "heavy": true}

// 무게 기준(#56) 허용 범위 — 앱(core prescription.ts LOAD_PCT_RANGE·LOAD_KG_MAX)과 같은 값. @plm SRS-063
var loadPctRange = map[string][2]int{"pct1rm": {30, 100}, "pctTop": {50, 100}}

const loadKgMax = 500.0

// 세트별 휴식(SPEC-051) 상한(초) — 앱 core restPlan REST_OVERRIDE_MAX 와 같은 값. 15분 넘는 휴식은 실수다.
const restMax = 900

// SanitizePrescription은 들어온 처방을 저장해도 되는 모양으로 만든다.
//
//	· 모르는 세트 타입 → `normal`(빼 버리면 줄 수가 어긋나 세트 수가 달라진다)
//	· RIR은 0~6으로 자른다. 음수·소수는 반올림해 범위 안으로
//	· 반복 수는 음수를 버린다(0은 "미지정")
//	· 모르는 중량 힌트 → 없음
//	· 20줄까지만
func SanitizePrescription(rows []PrescribedSet) []PrescribedSet {
	if len(rows) == 0 {
		return nil
	}
	if len(rows) > maxPrescriptionRows {
		rows = rows[:maxPrescriptionRows]
	}

	out := make([]PrescribedSet, 0, len(rows))
	for _, r := range rows {
		setType := r.SetType
		if !validSetTypes[setType] {
			setType = "normal"
		}
		loadHint := r.LoadHint
		if !validLoadHints[loadHint] {
			loadHint = ""
		}
		row := PrescribedSet{
			SetType:   setType,
			TargetRIR: clampRIR(r.TargetRIR),
			RepMin:    nonNegative(r.RepMin),
			RepMax:    nonNegative(r.RepMax),
			LoadHint:  loadHint,
		}
		row.LoadBasis, row.LoadPct, row.LoadKg = sanitizeLoadBasis(r)
		// 「최대」 줄은 횟수가 없다 — 앱(setSchemes toRow)과 같은 모양
		if r.Amrap {
			row.Amrap = true
			row.RepMin, row.RepMax = nil, nil
		}
		if validSchemes[r.Scheme] {
			row.Scheme = r.Scheme
		}
		// SPEC-051 사람이 정한 직전 휴식 — 범위 밖이면 버린다(앱 sanitizePrescriptionValue 와 같은 규칙)
		if r.Rest != nil && *r.Rest >= 0 && *r.Rest <= restMax {
			v := *r.Rest
			row.Rest = &v
		}
		out = append(out, row)
	}
	return out
}

// 무게 기준은 범위 밖이면 **기준째** 버린다 — 엉뚱한 무게를 채우는 것보다 안 채우는 게 낫다(앱과 같은 규칙).
func sanitizeLoadBasis(r PrescribedSet) (string, *int, *float64) {
	switch r.LoadBasis {
	case "fixed":
		if r.LoadKg == nil || *r.LoadKg < 0 || *r.LoadKg > loadKgMax {
			return "", nil, nil
		}
		// [원본] 소수 둘째 자리 — lb 왕복에 꼬리가 생겼다(135lb → 134.99lb). 앱과 같은 넷째 자리로(SPEC-023)
		kg := float64(int64(*r.LoadKg*10000+0.5)) / 10000
		return "fixed", nil, &kg
	case "pct1rm", "pctTop":
		rng := loadPctRange[r.LoadBasis]
		if r.LoadPct == nil || *r.LoadPct < rng[0] || *r.LoadPct > rng[1] {
			return "", nil, nil
		}
		v := *r.LoadPct
		return r.LoadBasis, &v, nil
	}
	return "", nil, nil
}

func clampRIR(v *int) *int {
	if v == nil {
		return nil
	}
	n := *v
	if n < rirMin {
		n = rirMin
	}
	if n > rirMax {
		n = rirMax
	}
	return &n
}

func nonNegative(v *int) *int {
	if v == nil || *v < 0 {
		return nil
	}
	return v
}

// KeepMemberStart 는 회원 줄의 시작 무게(start)를 코치 저장에서 지키지 않도록 되살린다(REV-028).
// 코칭 계약에는 시작 무게가 없어 코치 화면에서는 안 보이는 값이다 — 횟수만 고쳐도 지워지면 회원의 W40 이 작업 무게로 시작한다.
// 코치가 그 줄에 무게 기준을 정했으면 코치 값이 이긴다. 줄 수가 달라졌으면 자리를 믿을 수 없어 잇지 않는다.
func KeepMemberStart(clean, stored []PrescribedSet) []PrescribedSet {
	if len(clean) != len(stored) {
		return clean
	}
	out := make([]PrescribedSet, len(clean))
	copy(out, clean)
	for i := range out {
		if out[i].LoadBasis == "" && stored[i].LoadBasis == "start" && stored[i].LoadKg != nil {
			kg := *stored[i].LoadKg
			out[i].LoadBasis = "start"
			out[i].LoadKg = &kg
		}
		// SPEC-041 세트 방식 값도 코치 화면에 없다 — 피더는 코칭 계약에서 일반으로 읽히고, 「최대」·방식 이름은 빠진다.
		// 코치가 그 줄을 다른 타입·횟수로 고쳤으면 코치 값이 이긴다.
		// 코치 앱은 모르는 타입(UNSPECIFIED)을 일반으로 보내 「일부러 일반」과 구별할 수 없다 — 회원 값을 지킨다(REV 보류: proto 에 FEEDER).
		if stored[i].SetType == "feeder" && out[i].SetType == "normal" {
			out[i].SetType = "feeder"
		}
		sameType := out[i].SetType == stored[i].SetType
		if sameType && stored[i].Amrap && out[i].RepMin == nil && out[i].RepMax == nil {
			out[i].Amrap = true
		}
		if sameType && out[i].Scheme == "" && validSchemes[stored[i].Scheme] {
			out[i].Scheme = stored[i].Scheme
		}
		// SPEC-051 세트별 휴식도 코치 화면에 없다 — 코치가 보낸 값이 없고 타입이 같으면 회원 값을 잇는다(범위 밖은 잇지 않는다)
		if sameType && out[i].Rest == nil && stored[i].Rest != nil && *stored[i].Rest >= 0 && *stored[i].Rest <= restMax {
			v := *stored[i].Rest
			out[i].Rest = &v
		}
	}
	return out
}
