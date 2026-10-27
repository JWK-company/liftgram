<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P3 화면 — 결과 보고 (2026-10-27)

## 커밋
- `dd903a0` feat(opengym): P3 화면 — 운동 전 체중 체크인·체중 기록 전체·체중 추세 카드 (SRS-077·078 · 미배포)
- 브랜치 `feat/opengym-p3`(cab9bbe 위) · push·merge·배포 안 함 · 본인 파일 18개만

## 파일
- 새 파일
  - core `domain/weighIn.ts`(+테스트 6건): 띄울지 판정 `shouldOfferWeighIn` · `localDayRange`·`hasLogOnLocalDay`(표식 0 은 안 셈) · `bodyweightUnitOf` · `shownBodyweight`/`formatBodyweight`(소수 1자리) · `enteredBodyweightToKg`(보이던 숫자 그대로면 kg 원값) · `weighInStartKg`(지난 값 없으면 70kg/155lb)
  - `frontend/lib/bodyweightPref.ts`: `liftgram.weighInBeforeWorkout`(기본 끔) · `liftgram.bodyweightGoalKg`("" = 없음) 훅·세터 + `weighin:<id>` 표시 헬퍼
  - `frontend/lib/bodyweightLogs.ts`: 이력 구독(`observeWithColumns(weight_kg, measured_at)` — 고치기도 따라옴)
  - `components/session/WeighInSheet.tsx`: 시트(체크인·기록·고치기·목표가 같이 씀) + `WeighInCheckin`(ActiveWorkout 첫 진입 판정 · source='checkin')
  - `components/profile/BodyweightRow.tsx`(체중 칸 + 「체중 기록 전체」 시트 + 기록 시트) · `WeighInSettingRow.tsx`(스위치)
  - `components/ui/LineChart.tsx` · `components/analytics/BodyweightCard.tsx`
  - `e2e/opengym-bodyweight.spec.ts` 8건
- 기존 파일(최소 diff): `prefs.ts` +2(SYNCED_PREF_KEYS) · `ActiveWorkout.tsx` +6(import 2 · 렌더 1 · 완료·취소 때 표시 지움 2) · `ProfileClient.tsx` 스테퍼 줄 주석 보존 + `<BodyweightRow />`·`<WeighInSettingRow />` · `StatsClient.tsx` +4(import · 카드) · ko/en `bodyweight.*` 55키(「openGym 추천」 구역) · e2e `profile.spec`·`opengym-qa1` 체중 입력 단계를 새 경로로(원본 주석)
- 공용 ui(Dialog·charts·rows·primitives)·로컬 스키마·서버 **수정 없음**. guideCopy PREFIXES 에 `bodyweight.` 이미 있음 → 새 키 전부 게이트 통과.

## 검증
| 항목 | 결과 |
|---|---|
| `bun run test:core` | 472/472 (+6 weighIn) |
| tsc frontend·core | 0 |
| biome | 오류 0(경고 3·정보 2는 기존) |
| `make verify` | exit 0 |
| 새 e2e `opengym-bodyweight` (3400/3401 운영 빌드 · DB e2e_og_p3_10271944) | **8/8** |
| 관련 기존 e2e(session·session-assist·workout·profile·profile-edit·analytics·sync·data-safety·opengym-rir·qa1·muscle·declutter-block·p3·p4·shots·summary·home-primary·prefs-race·unit-toggle) | **96 통과 · 6 건너뜀(환경 게이트) · 실패 0** |

새 e2e 내용: ① 켜기→빠른 시작→시트(지난 기록 없음 안내·70.0 · 포커스=제목 H2·입력칸 없음 · 360×640 에서 패널 높이 ≤320 · 헤더 타이머가 패널 위 · 버튼 6개 ≥44×44 두 줄)→+1+1+0.5−0.1=72.4→저장→운동 화면 그대로→프로필 72.4kg·전체 기록 1줄 「운동 전」·IDB source=checkin→취소 뒤 표시 0개→같은 날 두 번째 시작 시트 없음 ② 「체중 없이 계속」(새로고침해도 안 뜸·표시 1개→취소 뒤 0개)·스크림·Esc·브라우저 뒤로(시트만 닫히고 /workout 유지) → 이력 0·미설정 ③ 꺼짐(기본)·완료 세트 있음·시작 11분 전 = 시트 없음 ④ 통계: 빈 안내 → 1개 = 「한 번 더 적으면 추세가 보여요」(한 번만) → 날짜를 20일 전·9일 전·오늘로 고친 3점: 기간 변화 −1.6kg · 주간 변화 표시 · 점 간격 비 1.05~1.45(날짜 비례) · 축 라벨 가로·세로 ≤4 · 360 에서 가로 라벨 안 겹침 · role=img·aria-label 「체중 곡선 · 최근 72.4kg · 기간 변화 −1.6kg」 · 누르면 그 점 값 · 목표 70 → 목표선(「목표」 글자)·「목표까지 2.4kg · 목표 70.0kg」·aria 끝 「목표 70.0kg」 · 1M·1Y·전체 전환 · 새로고침 유지 · 지우면 둘 다 사라짐 ⑤ 풀업 0kg×10: 체중 72 → 볼륨 720kg, 80 기록 뒤 800kg ⑥ 지우기: 둘 중 하나 = 「이 기록을 지울까요?」, 마지막 = 「마지막 기록을 지우면 체중이 미설정으로 돌아가요」 → 미설정(새로고침 유지) · 「체중 미설정으로 두기」 → 다시 열기 2회 미설정·이력 [78, 0표식]·미러 null·통계 「최근 78.0kg」(표식 안 보임) → 79 기록하면 79.0kg ⑦ lb: 프로필 weight_unit=lb → 165.3lb · 그대로 저장·직접 입력 같은 숫자 Enter 저장 → weight_kg 정확히 75(74.98 아님) · lb 스텝 ±0.2·1·2 · +0.2 → 165.5lb(=toKg(165.5)) ⑧ 백업 내보내기 → 새 컨텍스트 가입 → 가져오기 → 75.8kg·이력 2줄·새로고침 유지.

## 캡처
`.ouroboros-work/shots/p3/` 16장 — checkin·profile·history·stats-card × 360/390 × light/dark (DPR 2, Playwright colorScheme). 360 체크인 시트는 타이머·「완료」 버튼이 시트 위로 보인다.

## 대비(토큰 계산, 라이트 / 다크)
선 brand/카드 5.20 / 5.51 · 축·목표 글자 ink2/카드 9.99 / 10.19 · 주석 ink3/카드 4.83 / 5.42 · 시트 값 ink/surface 18.13 / 13.18 · 스텝 글자 ink/surface-alt 16.18 / 10.59 · 저장 on-brand/brand 5.20 / 7.04 · 취소 테두리 line-strong/surface 4.67 / 5.95 · 지우기 bad/surface 6.47 / 7.46 · 끝점 고리 card/brand 5.20 / 5.51.
낮은 것(의도): 격자 line/카드 1.38 / 1.41(흐린 보조선) · 스텝 버튼 면 surface-alt/surface 1.12 / 1.24 — 버튼은 글자(10~16:1)로 식별되고 RirSheet 스테퍼와 같은 모양.

## 판단·스펙과 다른 점
1. **표시 단위**: userContext 는 SRS-067 뒤로 `weightUnit` 을 늘 kg 로 준다. 그래서 체중 화면은 **예전 프로필 단위**(`user.weightUnit === 'lb'`)로 lb 를 고른다(core `bodyweightUnitOf`). 프로필 단위 줄이 없어져 새 사용자는 늘 kg, 옛 lb 사용자만 lb. 저장은 늘 kg.
2. **0(설정 안 함) 길**: 스테퍼를 막으면서 「체중 기록 전체 › 체중 미설정으로 두기」를 넣었다(확인창). 기존 core 경로 `updateUserSettings({bodyweightKg:null})` 가 그대로 표식 줄 + 미러 null 을 쓴다(CD-2 규칙 그대로) — qa1 회귀도 이 경로로 돌린다. 프로필 체중 캡션의 「(0=미설정)」 문구는 새 키 `bodyweight.profileCaption` 로 대체(옛 키는 남김).
3. 앞선 qa 조치(스테퍼 → manual `bw-profile-*` 줄 · 1분 합치기)와의 정리: 「기록」은 `addBodyweightLog`(일반 id · 측정 한 줄), 미설정만 `bw-profile-*` 경로. 「기록」 줄은 합치기 대상이 아니라 연타 문제 자체가 없다(명시적 저장). `opengym-qa1` 기대값을 그에 맞춰 바꿈(원본 주석 보존): 값 줄 3개는 일반 id, 표식만 `bw-profile-`.
4. 체크인 표시(`weighin:<id>`)는 시트를 **띄우는 순간** 남긴다(새로고침·재진입에도 그 운동에서 다시 안 뜸). 운동 완료·취소 때 지우고, 판정 때 다른 운동의 남은 표시도 걷는다. 판정은 운동마다 한 번 — 화면을 연 채 설정을 켜도 그 운동에서는 안 뜬다.
5. 뒤로 가기: 시트를 열 때 `history.pushState` 한 칸(기존 state 를 펼쳐 Next 트리 보존), popstate = 「체중 없이 계속」, 버튼으로 닫으면 그 칸을 `history.back()` 으로 걷는다. 이 처리는 체크인만(`trapBack`).
6. 시트는 공용 Overlay(최대 88dvh)를 고치지 않으려고 같은 모양을 파일 안에서 포탈(max-h 50dvh). 직접 입력칸은 「직접 입력」을 눌렀을 때만 생기고 그때 포커스(biome noAutofocus 때문에 ref 로).
7. 통계 카드는 운동 기록이 없어도 보인다(빈 통계 안내 아래) · 기본 기간 3개월 · 카드 머리 「기록」 · 목표 정하기/바꾸기/지우기 · 기록이 기간 안 1개면 곡선 대신 안내 한 번(주간 변화 줄은 숨김 — 같은 문장 두 번 방지). 주간 변화는 기간 선택과 무관하게 최근 28일(core weeklyRate).
8. 「최근」·남은 차이는 가장 최근 **유효 측정**(표식 제외)을 쓴다. 표식이 최신이면 프로필은 「미설정」, 통계는 마지막 측정값 — 의도(곡선은 측정만).
9. 차트 hover/터치: 가장 가까운 점의 날짜·값을 위 한 줄(aria-live)로. 키보드로 점을 고르는 길은 없다(aria-label 요약이 대안).

## 남은 위험·후속
- 두 기기 동기 뒤 체중 이력 e2e 는 이번 spec 에 없음(core·qa1 에서 다룸). 백업 경로만 e2e.
- 「기록 고치기」 날짜는 날짜만 바꾸고 시각은 유지 · 미래 날짜는 input max 로만 막음.
- `/plm-hub:codescan` 미실행(@plm SRS-077/078 주석만).

## 정리
3400·3401 종료 · DB `e2e_og_p3_10271944` 삭제 · next-env.d.ts 원복 · test-results·.media 삭제 · 임시 캡처 spec 삭제(캡처만 남김). 다른 폴더·포트 건드리지 않음.
