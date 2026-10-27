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

var validSetTypes = map[string]bool{"warmup": true, "top": true, "backoff": true, "normal": true}
var validLoadHints = map[string]bool{"light": true, "medium": true, "heavy": true}

// 무게 기준(#56) 허용 범위 — 앱(core prescription.ts LOAD_PCT_RANGE·LOAD_KG_MAX)과 같은 값. @plm SRS-063
var loadPctRange = map[string][2]int{"pct1rm": {30, 100}, "pctTop": {50, 100}}

const loadKgMax = 500.0

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
		kg := float64(int64(*r.LoadKg*100+0.5)) / 100
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
