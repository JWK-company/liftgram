# openGym P3 /qa code — 체중 체크인·프로필 체중 칸·체중 기록 전체·통계 체중 카드

- 대상: `/Users/woobi/Desktop/tarae/liftgram-wt-opengym-p2` · 브랜치 `feat/opengym-p3` · `git diff cab9bbe..dd903a0`(18파일 +2275/−16)
- 검토자(독립·읽기 전용): 프론트·데이터 정확성 코드 검토자 · 모바일 UX·접근성 감사관
- 방법: diff 전체 + 의존 core(`domain/bodyweight.ts`·`data/bodyweightRepository.ts`·`userRepository.updateUserSettings`·`state/userContext.tsx`) 정독, SRS-067·077·078 대조, 캡처 `shots/p3/` 확인. 운영 빌드는 띄우지 않았다(지적은 모두 코드에서 바로 확인되는 것이고, 구현자 e2e 8/8·회귀 96건은 보고를 믿고 다시 돌리지 않았다). 서버·DB를 만들지 않아 정리할 것도 없다.

## 핵심 의견

1. **운영 데이터를 잃거나 덮어쓰는 길은 없다.** 화면은 core 저장소(add/update/delete가 같은 write 안에서 `applyMirrorInWrite`, 미설정은 `updateUserSettings → writeProfileBodyweightInWrite`)만 부르고, 미러를 직접 쓰는 곳이 없다. 같은 숫자를 저장할 때 lb↔kg 왕복으로 값이 바뀌지 않게 막은 것(`enteredBodyweightToKg`, 고치기의 `kg !== e.weightKg`)도 맞다. v0.43 정리 로직(bw-init·legacy 흡수·표식)과 부딪히지 않는다. 고치기 뒤에는 프로필 updated_at ≥ 마지막에 쓴 줄이 되고 값도 같아서 legacy 흡수가 생기지 않는다.
2. **다만 고치기 날짜 칸이 측정 시각을 미래로 만들 수 있다(P3-1).** 그러면 그날 적은 새 기록이 「내 체중」이 되지 못해 미러, 맨몸 볼륨, 체크인 판정이 하루 동안 틀어진다. 머지 전에 고쳐야 할 유일한 데이터 정확성 문제다.
3. **판단 ①(lb 표시)은 SRS-067과 어긋난다.** SRS-067은 「프로필의 kg/lb 선택은 없애고 바 무게·체중은 kg로 고정한다」고 적었다. 같은 프로필 화면에서도 바 무게는 kg, 체중은 lb로 보이게 되고, lb 사용자는 되돌릴 길이 없다. 운영 사용자는 모두 kg(SRS-067 수용 기준)이라 영향은 작지만, 규칙을 하나로 두려면 kg로 고정하는 편이 맞다(P3-3).
4. 판단 ②(「체중 미설정으로 두기」)·③(e2e 입력 경로 변경)·④(운동 기록이 없어도 체중 카드 표시)는 **타당**하다. ②는 스테퍼의 0을 잇는 유일한 길이고 core 표식 경로를 그대로 쓴다. 다만 보이는 조건이 좁고 버튼처럼 보이지 않는다(P3-8). ③은 같은 되돌림 회귀를 새 입력 경로로 지킨다. 옛 경로(v0.43 클라이언트의 값 입력)는 이제 core 테스트만 지킨다. ④는 체중이 운동과 리듬이 다르다는 이유가 맞다.
5. 체크인 조건(켬·완료 세트 0·10분·오늘 유효 측정·표시)은 U-7을 그대로 따른다. 표시를 localStorage에 두고 끝날 때 지우는 것, 다른 운동 표시 정리, 판정 실패 때 띄우지 않기, 저장소 오류 때 「표시 있음」으로 보기도 모두 맞다. 오프라인에서도 로컬만 쓴다. 타이머·세트 기록은 막지 않는다. 시트는 판정이 끝난 뒤 뜨고, 저장 실패 때도 시트만 남는다.
6. 차트(날짜 비례·목표선 점선+「목표」·축 라벨 ≤4·role=img 요약·28일 회귀)는 U-21을 충족한다. 다만 카드의 기준 시각이 마운트 때 고정되어, 카드에서 막 적은 기록이 주간 변화에 빠진다(P3-2).
7. 문구에 감량·증량 권고나 평가가 없다(「목표와 같아요」·「목표까지 n」·숫자만). guideCopy `bodyweight.` 접두 안에 있다. 코드 보존 규칙도 지켰다([원본] 주석·[개선] 바로 아래).

## 지적

| ID | 심각도 | 위치 | 내용 · 재현 | 수정안 |
|---|---|---|---|---|
| **P3-1** | **높음(데이터)** | `src/frontend/app/components/profile/BodyweightRow.tsx:109-115`(withDate) · `:166`(max) · `:174` · core `data/bodyweightRepository.ts:138-155`(updateBodyweightLog 검사 없음) | 고치기의 날짜 칸은 **원래 시·분·초를 그대로 둔 채** 날짜만 바꾸고, `max`는 날짜만 막는다. 재현: 어제 21:00 기록 → 오늘 09:00에 날짜를 오늘로 고침 → measured_at = 오늘 21:00(미래). 10:00에 80kg 체크인/기록 → `latestEntry`는 21:00 줄을 고른다 → 미러(내 체중)·프로필 칸·맨몸/어시스트 볼륨(그날 운동의 `total_volume_kg`에 굳는다)이 **고친 옛 값**으로 남는다. `hasLogOnLocalDay`도 참이라 그날 체크인이 안 뜬다. `weeklyRate`는 `> now`를 빼므로 곡선과 주간 변화가 서로 다른 점 집합을 본다. 다른 기기로 동기되면 그쪽 정리도 같은 줄을 고른다. | 화면: `measuredAt = Math.min(withDate(...), Date.now())`. 오늘로 옮기면서 시각이 지금보다 뒤면 지금으로 맞춘다. core: `updateBodyweightLog`·`addBodyweightLog`에서 `measuredAt > Date.now() + 60_000`을 거부(또는 자르기)하고 테스트 1건(미래로 고친 뒤 새 기록이 내 체중이 되는지). e2e ⑥에 「오늘로 고치기 → 새 기록 = 내 체중」 한 단계를 더한다. |
| **P3-2** | 중간 | `src/frontend/app/components/analytics/BodyweightCard.tsx:48`·`:58` | `nowMs`는 마운트 때와 기간을 바꿀 때만 다시 잡는다. 그런데 `weeklyRate(valid, nowMs)`는 `measuredAt > now`를 뺀다. 재현: 28일 안에 서로 다른 날 2개가 있는 상태에서 통계를 열고 카드 머리 「기록」으로 세 번째를 적는다 → 곡선에는 점이 생기는데(`inRange`는 `nowMs + 1일`까지 받는다) 주간 변화는 계속 「한 번 더 적으면 추세가 보여요」다. 새로고침하거나 기간을 눌러야 나온다. 바로 그 말을 보고 기록한 사람에게 틀린 답을 준다. | 주간 변화의 now는 `Math.max(nowMs, latest?.measuredAt ?? 0)` 또는 렌더마다 `Date.now()`. 아니면 `logs`가 바뀔 때 `setNowMs(Date.now())`(useEffect [logs.length, 최신 measuredAt]). e2e ④에 「카드에서 세 번째 기록 → 즉시 주간 변화」를 더한다. |
| **P3-3** | 중간(스펙 충돌) | `src/core/src/domain/weighIn.ts:56-59`(bodyweightUnitOf) · 사용처 `WeighInSheet.tsx:343`·`BodyweightRow.tsx:30,63,128`·`BodyweightCard.tsx:49` | 판단 ①. SRS-067 본문은 「프로필의 kg/lb 선택은 없애고 **바 무게·체중은 kg로 고정**한다」이다. 지금은 예전 프로필 단위가 lb인 사람에게만 체중을 lb로 보여 준다. 그러면 같은 프로필 화면의 바 무게(kg)와 체중(lb)이 다르고, 통계 볼륨(kg)과 체중 카드(lb)도 다르다. 단위 줄이 없어져 **그 사람은 영영 kg로 돌아갈 수 없다**. 운영 사용자가 모두 kg라 실제로 맞는 사람은 거의 없지만, 규칙이 둘이 된다. | `bodyweightUnitOf`가 늘 `'kg'`을 돌려주게 한다([원본] 주석 보존). lb 스텝·왕복 로직은 core에 그대로 두어 나중에 「체중 단위」 설정이 생기면 쓴다. lb e2e ⑦은 core 테스트로 옮기거나 skip한다. 이 단위를 꼭 유지하려면 SRS-067·077을 /requirement로 먼저 고친다(둘 중 하나). |
| P3-4 | 중간(UX·접근성) | `src/frontend/app/components/profile/BodyweightRow.tsx:231-249` | 목록 각 줄의 「고치기」·「지우기」 버튼 이름이 줄마다 같다. 스크린리더로 탭 순서를 돌면 「고치기, 지우기, 고치기, 지우기…」만 들리고 어느 기록인지 모른다. 지우기는 되돌릴 수 없는 동작이다(확인창에 값이 나오긴 하지만 마지막 줄이면 값이 안 나온다 — `:283-286`). | `aria-label={\`${값}${unit} · ${날짜} ${t("bodyweight.edit")}\`}`(지우기도 같게). 마지막 기록 확인 메시지에도 값·날짜를 한 줄 덧붙인다. |
| P3-5 | 낮음(접근성) | `src/frontend/app/components/session/WeighInSheet.tsx:186-198`·`:207-220` | ① 스크림이 포커스 가능한 `<button aria-label="체중 없이 계속">`이라 대화상자 밖에 같은 이름의 버튼이 하나 더 들린다. ② `aria-modal`인데 포커스 가두기가 없어 Tab이 뒤쪽 운동 화면으로 빠진다. ③ 닫은 뒤 포커스를 돌려놓지 않는다(body로 간다). 공용 Overlay와 다른 모양을 파일 안에 둔 대가다. | 스크림에 `tabIndex={-1}` + `aria-hidden`(Esc·닫기 버튼이 대안). 첫·마지막 버튼 사이에서 Tab을 돌리고, 열 때의 `document.activeElement`를 기억했다가 닫을 때 돌려준다. 장기적으로는 공용 Overlay에 `maxHeight` prop을 더하는 편이 낫다(다음 단계). |
| P3-6 | 낮음(UX) | `WeighInSheet.tsx:75-81`(core) · `:135-142` | 직접 입력은 0보다 크고 300 이하면 모두 받는다. 「72」를 치다 「7」에서 Enter·저장하면 **7kg가 내 체중**이 되어 맨몸 볼륨이 크게 틀어진다(지울 수는 있다). 범위 밖이나 숫자가 아닌 값은 말없이 예전 값으로 돌아간다(왜 안 바뀌었는지 안 알려 준다). | 지난 값이 있으면 ±30% 밖일 때 확인 한 줄(「지난 기록 72.4kg와 차이가 커요 · 그대로 저장」). 하한은 20kg 정도로 둔다(웰니스 평가가 아니라 오타 방지). 거부할 때는 입력칸 아래 caption 한 줄을 띄운다. |
| P3-7 | 낮음(모바일) | `WeighInSheet.tsx:188-198`·`:236-257` | 직접 입력 중 키보드를 내리려고 시트 위쪽 어두운 곳을 누르면 그것이 **「체중 없이 계속」**이다. 친 값이 사라지고 표시가 남아 그 운동에서는 다시 뜨지 않는다. iOS 숫자 키패드에는 Enter가 없어 이렇게 내리는 일이 흔하다. | `typing` 중 스크림을 누르면 입력칸 blur(=commitTyped)만 하고 닫지 않는다. 그다음 누르면 닫는다. 또는 `enterKeyHint="done"` + 입력칸 옆 「확인」 작은 버튼. 실기기(iOS PWA)로 한 번 확인한다. |
| P3-8 | 낮음(UX) | `BodyweightRow.tsx:254-266` | 판단 ②의 「체중 미설정으로 두기」는 ⓐ 보통 글자라 버튼처럼 보이지 않는다(캡처 history-360). ⓑ `rows.length > 0`일 때만 보인다. 그래서 이력이 0인데 프로필 값만 있는 사람(로그인 안 한 기기는 bw-init을 심지 않는다 · CD-5)은 미설정으로 돌릴 길이 아예 없다. 같은 사람은 통계 카드가 「체중을 적으면…」 빈 상태인데 프로필에는 75kg가 보여 두 화면이 서로 다르다. | ⓐ 다른 줄과 같은 ListRow(chevron) 또는 테두리 버튼. ⓑ 조건을 `bodyweightKg != null && userId`로 바꾼다(core 경로는 이력 0에서도 표식이나 미러 null로 처리한다 — `planProfileBodyweightWrite` 마지막 분기). 카드 빈 상태도 `bodyweightKg != null`이면 「프로필 값 75.0kg · 기록하면 곡선이 그려져요」로 맞춘다. |
| P3-9 | 낮음(경합) | `WeighInSheet.tsx:345-385` | 표시(`weighin:<id>`)를 비동기 판정이 **끝난 뒤** 남긴다. 같은 운동을 탭 두 개로 열면 둘 다 판정을 통과해 시트가 두 번 뜨고, 둘 다 저장하면 같은 날 측정이 두 줄 생긴다. 해는 없지만(같은 값 두 줄) U-7의 「한 번」과 다르다. | 판정을 시작할 때 `setWeighInMark`를 먼저 하고, 띄우지 않기로 하면 지운다. 또는 저장 직전에 `hasLogOnLocalDay`를 다시 본다(이미 오늘 기록이 있으면 시트만 닫고 토스트). |
| P3-10 | 낮음(이력 스택) | `WeighInSheet.tsx:102-129` | 버튼으로 닫으면 cleanup이 `history.back()`을 부른다(비동기). 그런데 리스너를 먼저 떼어서 `ignorePop`은 아무 일도 하지 않는다. ⓐ 저장 직후 사용자가 곧바로 링크를 눌러 `router.push`하면 늦게 온 back이 **새 화면을 되돌릴** 수 있다(짧은 창). ⓑ 개발 StrictMode에서는 push→back→push가 겹쳐 한 칸이 남는다(운영 무관). | `history.state?.liftgramWeighIn`을 확인한 뒤 `history.back()`하는 것은 맞다. ⓐ는 back을 부르는 대신 `history.replaceState(원래 state)`로 칸을 무력화하는 방법(칸은 남지만 같은 주소)이나, `ignorePop` 리스너를 back이 끝날 때까지 떼지 않는 방법이 있다. 쓰이지 않는 `ignorePop`은 정리한다. |
| P3-11 | 낮음(병렬 기기) | core `domain/bodyweight.ts:357-364`(planProfileBodyweightWrite 합치기) · 부르는 곳 `BodyweightRow.tsx:312` | 「미설정으로 두기」는 프로필 경로를 탄다. 그래서 **가장 최근 줄이 1분 안에 쓴 `bw-profile-*` 줄이면 그 줄을 0으로 고친다**(합치기). 이번 화면에서는 그런 줄을 만들지 않지만, 아직 v0.43인 다른 기기의 스테퍼 입력(값 줄)이 동기된 지 1분 안에 이 기기에서 미설정을 누르면 그 **측정값이 표식으로 바뀌어 사라진다**. | 미설정은 늘 새 줄로 만든다(합치기는 w>0끼리만 · `mergeable &&` 조건에 `w > 0 && top.weightKg > 0`). core 테스트 1건. |
| P3-12 | 낮음(차트) | `src/frontend/app/components/ui/LineChart.tsx:236-238` · `BodyweightCard.tsx:150-161` | ⓐ 점 key가 `p${x}`라 같은 measured_at 두 줄(가져오기·두 기기)이면 key가 겹친다. ⓑ 28일 안에 서로 다른 날이 3개 미만이면 늘 「한 번 더 적으면 추세가 보여요」인데, 기록 2개가 60일 떨어져 있으면 한 번 더 적어도 안 나온다(문구가 약속을 못 지킨다). ⓒ `!loaded`일 때 카드가 「이 기간에 기록이 없어요」를 잠깐 보인다. | ⓐ key에 index를 섞는다. ⓑ 28일 안의 날 수로 문구를 가른다(「최근 4주에 3번 이상 적으면 추세가 보여요」). ⓒ `loaded` 전에는 곡선 자리를 비우거나 스켈레톤으로 둔다. |
| P3-13 | 낮음(i18n) | `src/core/src/i18n/locales/en.ts`(`bodyweight.skip`·`directInput`·`historyCount`) | 「Continue without」은 목적어가 없다. 「Type」은 동작 이름으로 애매하다. 「{count}」만 있는 값은 스크린리더에 그냥 「5」로 들린다. | 「Skip for now」(또는 「Continue without logging」) · 「Enter value」 · 「{count} entries」. |

### 점검했으나 문제 없음
- 같은 날 두 번째 운동 · 운동 완료·취소 때 표시 지움 · 다른 운동 표시 정리 · 판정 실패 · 저장소 예외 = 모두 맞다.
- lb 왕복(보이던 숫자 = kg 원값), 스텝 경계 자르기, 고치기에서 값을 그대로 두면 kg을 쓰지 않음.
- 지우기 → `mirrorAfterLogWrite`(표식 포함 최신) → 마지막이면 null. 확인창 분기는 유효 줄 수로 가르는데, 이것이 미러 결과와 맞는다.
- `observeWithColumns(weight_kg, measured_at)`라 고치기가 목록·카드에 바로 반영된다. 미러는 `refresh` + useModelData로 따라온다.
- 360×640: 시트 높이 ≤50dvh, 헤더 타이머가 스크림 아래로 보이고, 버튼 6개가 두 줄에 각 ≥44다(캡처 checkin-360). 기록 목록·카드에도 가로 넘침이 없다. 눈에 띄는 터치 대상은 모두 ≥44다.
- 대비(구현자 토큰 계산값)는 글자가 모두 ≥4.5다. 격자 1.38은 보조선이라 괜찮다. 빨강 계열은 brand(저장·선)와 bad(지우기) 두 종류로, 화면 정리 규칙 안이다.
- 웰니스: 권고·평가 문구가 없고, 목표 방향(감량/증량)에 따라 문구가 다르지 않다.
- 주석 보존: ProfileClient 스테퍼를 JSX 블록 주석으로 막았고 [개선] 호출이 바로 아래에 있다. 옛 i18n 키는 남겼다. tsc가 통과한다(보고 기준).
- e2e 품질: 비동기 판정에 `waitForTimeout(1500)` 고정 대기(`시트_없음`)가 있다. 부정(없음) 확인이라 피하기 어렵다(허용). 날짜를 되감는 고치기·IDB 직접 확인·백업 왕복은 좋다. 빠진 것: P3-1(미래 시각)·P3-2(카드에서 바로 기록)·두 탭.

## 판정

**조건부 통과(머지 전 P3-1 수정 필수, P3-2·P3-3 권장).**
- P3-1(높음): 고치기가 미래 측정 시각을 만들어 내 체중·맨몸 볼륨이 틀어진다. 화면 자르기와 core 거부, 테스트 1건을 더한다.
- P3-2·P3-3(중간): 주간 변화 기준 시각, 체중 단위 kg 고정(SRS-067). 둘 다 몇 줄로 고칠 수 있다.
- P3-4~P3-13(중간 1·낮음 9): 이번 또는 다음 정리에서 처리한다. P3-11은 core 한 줄이라 함께 고칠 것을 권한다.
- 구현자 판단: ① 부적절(P3-3) · ② 타당(보완 P3-8) · ③ 타당 · ④ 타당.
