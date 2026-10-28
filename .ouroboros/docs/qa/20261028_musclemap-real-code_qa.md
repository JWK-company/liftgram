# /qa code — 근육 지도 실제 근육 그림·주황 농도·오픈소스 고지 (SRS-090 · ADR-044)

- 대상: `/Users/woobi/Desktop/tarae/liftgram-wt-musclemap` (feat/musclemap-real), 커밋 안 된 변경 6개 파일
  (`BodyMap.tsx` · `bodyMapPaths.ts`(신규) · `scripts/gen-body-map-paths.mjs`(신규) · `app/licenses/page.tsx`(신규) · `ProfileClient.tsx` · `e2e/opengym-muscle.spec.ts`)
- 참여 전문가(역할): **프론트엔드 SVG·접근성 전문가**, **오픈소스 라이선스 감사관**
- 방식: 읽기 전용. 코드 수정 없음. 원본 클론(`.../scratchpad/og/MuscleMap`, HEAD `d53ddf4`)과 직접 대조하는 스크립트를 scratchpad 에서 돌림.

## 결론

**High 0 · Med 1 · Low 5.** 출시를 막는 결함은 없다. 데이터 변환·라이선스 고지·data 속성 계약은 실측으로 문제없음을 확인했다.
Med 1건은 e2e 대비 검사의 판정력이 줄어든 문제다(회귀를 숨길 수 있음).

## 실측으로 확인한 사항(결함 없음)

| 항목 | 근거 |
|---|---|
| 변환기 slug 누락 없음 | 원본 `MaleFrontPaths.swift` 의 `BodyPartPathData(` 29개 / `MaleBackPaths.swift` 21개 → 정규식 매치 29 / 21. 따옴표 안 경로 문자열 전체 123 / 78개가 **모두** 매치 범위 안에 들어감(누락 0, `M` 로 시작하지 않는 문자열 0). `common:`(앞 3 · 뒤 2)·`left:`·`right:` 키 구분 없이 블록 안의 모든 경로를 모으므로 common/left/right 누락 없음. 한 매치가 다음 블록을 삼키는 경우 0. |
| 생성물 = 변환기 출력 | 변환기를 scratchpad 로 복사해 원본에 다시 돌린 결과 JSON 이 커밋 대상 `bodyMapPaths.ts` 와 **완전히 같음**(손으로 고친 흔적 없음). gzip 19,996 B(수용 기준 30KB 이하 충족). |
| 12구역 모두 그려짐 | 앞 zones = chest·abs·biceps·triceps·shoulders·quads·calves·traps·forearms, 뒤 = traps·shoulders·back·triceps·forearms·glutes·hamstrings·calves → 합집합이 `MAP_MUSCLES` 12개와 일치. |
| React key 중복 없음 | 한 배열(base·hair·각 zone) 안에서 같은 `d` 가 두 번 나오는 경우 0(앞·뒤 모두). 배열 사이 중복(아래 L-1)은 서로 다른 형제 목록이라 key 충돌이 아니다. |
| crop 좌표 | 경로 bbox(제어점 포함 상한) 실측 앞 x 52.8~675.5 · y 96.3~1340.5 / 뒤 x 772.5~1394.6 · y 96.2~1342.7 → `REAL_CROP` 앞 [48..680]×[92..1346], 뒤 [767..1399]×[92..1346] 안에 모두 들어감. `overflow="visible"` 이어도 앞 그림이 간격(40)·뒤 그림을 침범하지 않음. |
| data-muscle·data-level 계약 | `RealBody` 가 `g[data-muscle][data-level]` 을 그대로 붙임(BodyMap.tsx:262). 단계 계산(`levelOf`)·`muscleShadeLevel`·접근 이름(`muscleMapAriaLabel`)은 변경 없음. e2e 202~204·291~293 줄의 속성 검사 그대로 유효. |
| 중첩 svg 접근성 | 바깥 `<svg role="img" aria-label>` 가 접근 이름을 갖고, 안쪽 `<svg aria-hidden="true">` 는 role=img 의 표시용 자식이라 이름 계산에 영향 없음. `<title>` 은 aria-hidden 아래여도 마우스 툴팁으로만 작동(기존 의도와 같음). mini 는 통째로 aria-hidden 유지. |
| 부르는 쪽 4곳 폭 | 비율이 156/198(0.79) → 1304/1254(1.04)로 넓어짐: Full 150px→156(옛 118) · 160→166(옛 126) · 180→187(옛 142), mini 40→42px(옛 32). Full 은 모두 `flex justify-center` 안이라 360 폭 카드(내용 약 296px)에 여유. mini 는 `RoutineMuscleMini` 가 `bodyMapMiniWidth(40)` 로 자리를 잡고 「시작」 sm 버튼과 같은 열(`items-center`)이라 열 폭은 버튼이 정함. e2e 360·390 겹침·가로 스크롤 검사가 이를 덮음. API 불변(`tone` prop 받기만). |
| MIT 전문 일치 | `licenses/page.tsx` 의 `MUSCLEMAP_MIT` 와 원본 `LICENSE` 를 바이트 비교: 원본 끝 줄바꿈 1개만 다르고 나머지 **글자 그대로 같음**(저작권 줄 `Copyright (c) 2026 Melih Colpan` 포함). |
| 생성 파일 헤더 고지 | `bodyMapPaths.ts` 1~4줄에 출처(저장소 URL)·저작자·MIT·고지 위치(/licenses) 명시. 변환기 헤더도 동일. 사본에 고지를 함께 두라는 MIT 조건을 화면(/licenses)과 소스 양쪽에서 충족. |
| openGym(AGPL) 미사용 | 변환 입력은 MuscleMap Swift 원본 경로뿐이고(재생성 일치로 증명), 세 파일에서 openGym 은 변환기 5줄 주석 「openGym 과 같은 선택」 한 곳뿐(코드·데이터 반입 없음). |
| 고지 화면 도달 | `/licenses` 는 미들웨어 가드 없음(`/privacy` 와 같은 정적 페이지). 프로필 링크 `data-testid="link-licenses"` + e2e 로 도달·전문 일부 검사. |

## 결함

### M-1 (Med) e2e 대비 검사가 「칠」 회귀를 잡지 못한다 — `max(칠, 윤곽선)` 이 늘 윤곽선으로 통과
- 위치: `src/frontend/e2e/opengym-muscle.spec.ts:341-342, 415-416, 446, 483` · 원인 `src/frontend/app/components/ui/BodyMap.tsx:214-226`(`realZoneStyle`)
- 근거: 1·2·3단계 모두 같은 `stroke: var(--color-brand)` 를 쓴다. brand 윤곽선 대비는 라이트 4.64~5.20 · 다크 5.51~7.04(토큰으로 계산)라 `Math.max(fill3, outline3) >= 3`, `Math.max(fill2, outline2) >= 3` 는 **칠 값과 무관하게 항상 참**이다. 옛 검사(`fill3 >= 3`)는 칠 자체를 쟀다.
- 실패 시나리오: `fillOpacity` 계산이 틀어지거나(예: 단계 값이 문자열로 와서 모두 0.45), `--color-brand-vivid` 토큰이 빠져 칠이 사라지거나, 2·3단계가 같은 농도가 돼도 e2e 5개가 모두 통과한다. SRS-090 수용 기준 「단계 0·1·2·3과 선택 근육이 서로 다른 색」은 어디서도 검사되지 않는다(ADR-044 가 다크에서 2·3단계가 뒤집힌 안을 실측으로 기각한 바로 그 회귀를 못 잡음).
- 권장 수정: 대비 하한은 지금처럼 두되 **칠의 순서·차이를 따로 단언**. 예: `대비_재기` 에 `fill1` 추가 후 `fill0 < fill1 < fill2 < fill3`(바탕 대비 기준 단조 증가)와 `ratio(fill3색, fill2색) >= 1.2` 정도, 그리고 `sel` 구역 칠이 3단계 칠과 다름(`ratio >= 1.5`)을 단언. 윤곽선은 `outline1/2/3 >= 3` 으로 따로 단언(`max` 로 묶지 않기).

### L-1 (Low) 전거근(serratus)이 회색 바탕이 아니라 복근으로 칠해진다 — 경로가 obliques 와 같음
- 위치: `src/scripts/gen-body-map-paths.mjs:30-41`(BASE 에 `serratus`), 생성물 `bodyMapPaths.ts` front.base
- 근거: 원본 `MaleFrontPaths.swift` 의 `.obliques`(80줄)와 `.serratus`(261줄)가 **같은 경로 12개**를 가진다(예 `M264.21 435.53…` 이 82·263줄 둘 다). 그래서 front.base 와 front.zones.abs 사이에 같은 `d` 12개가 겹치고, abs 가 나중에 그려지므로 스펙·코드 주석의 「전거근 = 회색 바탕」과 달리 복근을 하면 그 자리가 주황이 된다. 화면 결함은 아니고(같은 모양이 겹칠 뿐) 경로 12개(약 3KB)를 두 번 그리는 낭비 + 문서와 실제의 불일치.
- 권장 수정: 변환기에서 이미 zone 에 들어간 경로는 base 에서 빼거나(`Set` 차집합), `serratus` 를 DROP 으로 옮기고 주석에 「원본에서 obliques 와 같은 경로」라고 적기.

### L-2 (Low) 원복 지시가 그대로는 컴파일되지 않는다 — `tone` → `_tone` 개명
- 위치: `BodyMap.tsx:301`(`tone: _tone = "neutral"`), `:345`(mini 동일), 주석 처리된 원본 호출 `:330-331`, `:372-373`(`tone={tone}`)
- 실패 시나리오: 주석 안내(「아래 두 줄을 살리고 RealBody 를 주석 처리」)대로만 하면 `tone` 이 정의되지 않아 tsc 실패. 코드 보존 규칙의 「호출 한 줄로 원복」(ADR-044 되돌림)이 실제로는 매개변수 개명까지 필요.
- 권장 수정: 원복 주석에 「`_tone` → `tone` 으로 되돌림」을 한 줄 더 적거나, 이름은 `tone` 그대로 두고 `void tone;`/biome-ignore 로 미사용 경고만 막기.

### L-3 (Low) 파일 머리 설명이 옛 그림 기준으로 남아 새 설명과 충돌
- 위치: `BodyMap.tsx:8-19`
- 근거: 새 [개선] 블록(3~6줄) 아래에 「단계 0 = 윤곽선만 line-strong · 칠 30%·60%·100%」「무채 농도 + 선택만 brand-vivid」「왼쪽 절반만 그리고 거울로 뒤집는다」 등 옛 실루엣 설명이 [원본] 표시 없이 현재형으로 남아 있다. 새 그림은 회색 칠·45/75/100%·선택=ink·좌우 모두 원본 경로다.
- 권장 수정: 8~19줄 앞에 `[원본 — 옛 실루엣 설명]` 머리표를 붙여 구분.

### L-4 (Low) mini 의 주근육/보조근 구분이 옅다(100% vs 75%)
- 위치: `BodyMap.tsx:357`(mini levelOf 3/2) · `:221`(opacity 0.75)
- 근거(토큰 계산): 라이트 카드에서 3단계 칠 vs 2단계 칠 대비 1.29:1(바탕 #F7F7F7 1.26, #F1F2F4 1.24), 다크 1.45~1.55. 옛 그림은 100% vs 60%였다. 40px 높이 mini 에서 둘 다 같은 brand 0.75px 윤곽선을 둘러 구분이 더 약해진다. 스펙이 정한 값이라 결함은 아니나, mini 주석(「작은 크기에서는 30% 가 바탕에 묻힌다 — 보조근은 2단계」)의 의도(주/보조 구분)는 약해짐. 또 윤곽선 0.75px(`non-scaling-stroke`) 은 3:1 을 수치로는 내지만 안티앨리어싱으로 실제 화면 대비는 계산값보다 낮게 보일 수 있다.
- 권장 수정: mini 만 보조근을 1단계(45%)로 내리거나, 실기기 캡처로 구분 가능 여부를 한 번 확인. (옆 caption 글자가 정보를 대신하므로 우선순위 낮음.)

### L-5 (Low) 변환기 견고성·출처 기록
- 위치: `gen-body-map-paths.mjs:62-68`, 생성물 `viewBox` 필드
- 근거: 정규식이 닫는 괄호를 `\n {8}\)`(공백 8칸 들여쓰기)로 찾는다. 지금 원본에서는 누락 0이지만, 상류가 들여쓰기를 바꾸면 블록이 조용히 빠지거나 다음 블록을 삼킬 수 있다(모르는 slug 는 throw 하지만 **매치 실패는 경고 없음**). 또 원본 커밋 해시를 기록하지 않아 재생성 시 어느 판을 썼는지 알 수 없다. `BODY_PATHS.*.viewBox`([0,95,727,1280]) 는 어디서도 쓰이지 않는다(`REAL_CROP` 이 대신함).
- 권장 수정: `text.match(/BodyPartPathData\(/g).length === out.length` 단언과 「따옴표 경로 총수 == 모은 경로 수」 단언 추가, 헤더에 원본 커밋(`d53ddf4`) 기록, 안 쓰는 `viewBox` 는 빼거나 `REAL_CROP` 근거로 쓰기.

## 코드 보존 규칙 점검
- 옛 `FRONT/BACK`·`zoneStyle`·`BASE_STYLE`·`ShapePaths`·`Body`·`VIEW_W/H` 본체 삭제 없음, 호출부는 `{/* [원본] … */}` 주석, 새 호출은 바로 아래 `[개선]` — 규칙 준수. `bodyMapMiniWidth`·viewBox·width 도 `[원본]` 주석 보존. e2e 의 옛 `outline0` 단언도 `[원본]` 주석으로 보존. 미흡점은 L-2(개명으로 원복 불완전)뿐.

## e2e 변경 판정
- `outline0 >= 3` → `fill0 >= 1.15` 완화는 SRS-090 수용 기준(「회색 1.15:1 이상 · 장식 실루엣」)과 일치하는 의도된 변경. 실측 여유: 라이트 1.24~1.38 · 다크 1.41~1.80.
- 새 고지 테스트는 링크 → URL → 전문 두 구절을 확인(충분).
- 문제는 M-1(칠 단언이 사실상 꺼짐) 하나.

## 조치 (작성자 · 2026-10-28)
- M-1: e2e 에 `칠_순서()` — 3단계 칠 ≥2.5 · 0 < 2 < 3(바탕 대비) 를 4곳(통계 라이트·오늘 카드 mini·시트·통계 다크)에서 따로 단언 → 윤곽선이 대비를 대신 채워도 칠 소실·단계 역전은 잡힌다. 5 통과.
- L-1: serratus 를 DROP 으로(obliques 와 같은 경로 중복) — 생성물 45.8KB → 43.7KB.
- L-2: `_tone` 원복 안내 주석.
- L-3: 머리 주석에 「아래는 [원본] 옛 실루엣 설명」 표시.
- L-5: 변환기 — 들여쓰기 비의존 파싱 · 원본 항목 수 대조(놓치면 중단) · 경로 0개면 중단 · 원본 커밋(d53ddf4) 헤더 기록 · viewBox 필드는 「참고용」 주석.
- L-4(mini 주/보조 1.29:1): 보류 — 옆 caption 글자가 정보를 대신하고(U-12) 스펙 값.
