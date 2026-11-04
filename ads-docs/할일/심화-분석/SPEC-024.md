# SPEC-024 — 분석 탭 심화 분석 — 오른·내린 종목, 그대로인 종목, 근육별 주간 세트, 직전 대비

> 타입 Spec · 그룹 할일/심화-분석 · ADStudio가 `SPEC-024.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-051, SRS-101

## 목표

분석 탭 한 페이지에 심화 분석을 넣고, 겹치던 기간 성과 요약 페이지와 코치에게 보내기 입구를 없앤다. 전부 무료다(SRS-101, ADR-051).

**등급 근거:** 새 화면 구성과 저장소 함수가 들어가고 파일이 5개를 넘지만 분석 탭 하나에 묶인다. Feature, 한 단계로 진행한다.

## 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/core/src/domain/exerciseProgress.ts` | 새 파일. 종목 변화, 그대로인 종목, 주간 근육 세트 순수 계산 |
| `src/core/src/domain/__tests__/exerciseProgress.test.ts` | 새 파일. 단위 시험 |
| `src/core/src/data/analyticsRepository.ts` | `getExerciseE1rmSessions` 추가 |
| `src/core/src/data/muscleLoadRepository.ts` | `weeklyMuscleSetsRecent` 추가 |
| `src/frontend/app/components/analytics/ExerciseChangeCards.tsx` | 새 파일. 오른·내린 종목, 그대로인 종목 카드 |
| `src/frontend/app/components/analytics/WeeklyMuscleCard.tsx` | 새 파일. 근육별 주간 세트 표 |
| `src/frontend/app/components/analytics/StatsClient.tsx` | 입구 제거, 카드 배치, 직전 기간 대비 |
| `src/frontend/app/components/ui/rows.tsx` | `KpiRow` 항목에 선택 칸 `sub` 추가 |
| `src/frontend/app/stats/summary/page.tsx` | `/stats`로 넘기기 |
| `src/frontend/lib/shellCache.ts` | 오프라인 셸 목록에서 `/stats/summary` 제외 |
| `src/frontend/sw/sw.template.js` | 셸 목록 제외, 옛 주소를 워커가 `/stats`로 넘김 |
| `src/frontend/lib/appDistribution.ts` | 앱 교체 점검: 대기열을 한 번 보내 보고 남아도 막지 않음 |
| `src/core/src/i18n/locales/ko.ts`, `src/core/src/i18n/locales/en.ts` | 새 문구 |
| `src/frontend/e2e/summary-card.spec.ts` | 새 파일. 서버 API로 만든 카드의 DM·알림·리포트·해지 거부 |
| `src/frontend/e2e/analytics-deep.spec.ts` | 새 파일. 분석 탭 e2e |
| `src/frontend/e2e/ad-slots.spec.ts` | 사라진 `stats-summary-entry` 대신 분석 탭 표지로 |
| `src/frontend/e2e/opengym-summary.spec.ts` | 보내기 화면으로 시작하는 파일이라 건너뜀 표시 |

**건드리지 않는 것:** 서버의 `SendProgressSummary`와 DB, `src/core/src/domain/periodSummary.ts`(`SummaryV1` 스냅샷 계약), DM 카드, 코치 회원 리포트(`src/frontend/app/components/summary/MemberReportDialog.tsx`), 오프라인 대기열(`src/frontend/lib/summaryOutbox.ts`).

## 설계

### 계산 규칙

입력은 종목별 운동 한 번의 최고 추정 1RM이다: `{ exerciseId, atMs, value }`. 저장소가 `bestEstimatedOneRepMax`로 만든다(`getExercise1RMTrend`와 같은 식, 워밍업·실패 세트 제외, 값 0 제외). 종목 단위로 묶어 종목 상세 화면의 추세와 숫자가 맞게 한다. 유산소와, 체중을 모르는 어시스트·맨몸 세트는 뺀다(보조를 줄인 향상이 내림으로 뒤집히고, 맨몸 추가 무게의 변화율이 부풀려지기 때문).

- **종목 변화 `exerciseChanges(points, sinceMs, limit)`:** 기간 안 운동이 2회 이상인 종목의 첫 값과 마지막 값을 비교한다. 0.5kg 미만 차이는 변화로 치지 않는다. 오른 쪽과 내린 쪽을 변화율 절댓값이 큰 순서로 각각 자른다.
- **그대로인 종목 `plateauedExercises(points, nowMs, opts)`:** 시간순으로 최고값을 갱신하며, 최근 PR과 같이 조금이라도 높으면 갱신이다. 실제 최고값을 보여 준다. 기준값은 4주, 3회, 최근 28일이다. 오래된 순으로 5개까지다. 고른 기간과 무관하며 화면에 「전체 기록 기준」이라고 적는다.
- **주간 세트 `weeklyMuscleSets(items, weeks, nowMs)`:** 월요일 시작 주로 나눠 `setsByMuscle`로 계산한다. 세트가 하나라도 있는 근육만 많은 순으로 낸다. 전신(`fullBody`)은 지도 근육이 아니어서 제외하는 대신 기존 카드와 같이 따로 한 줄로 둔다. 주 계산은 `src/frontend/app/components/analytics/StatsClient.tsx`와 같은 로컬 월요일 기준이다.

### 화면 순서

대표 볼륨 → 숫자 줄(직전 대비 포함) → 추정 1RM → **오른·내린 종목** → 근육 균형 → 세트 힘든 정도 → 최근 PR → 광고 자리 → **최고 기록이 그대로인 종목** → **근육별 주간 세트** → 체중. 그대로인 종목과 주간 세트는 고른 기간과 무관하므로 「기록 없음」 분기 밖에 둔다.

- 오른·내린 종목 줄은 종목 상세로 이어진다. 값은 `formatWeight`로 적은 첫 값 → 마지막 값과 변화율이다. 구역 제목에 「추정 1RM」을 적고 줄마다 태그를 달지 않는다. 오름은 `--color-ok`, 내림은 대표 숫자의 `Delta`와 같이 `--color-ink2`다. 화살표를 함께 써서 색에만 기대지 않는다.
- 그대로인 종목 줄은 최고값, 「N주 전 최고 · 그 뒤 M회」, 종목 상세 링크다. 없으면 구역째 숨긴다. 오른·내린 종목은 비면 「이 기간에 두 번 이상 한 종목이 없어요」를 보여 준다.
- 주간 세트는 진짜 `table` 요소로 그린다. 칸마다 숫자를 적고 바탕은 근육 지도와 같은 무채색(`--color-ink2`) 농도이며 상한은 40%다. `table-layout: fixed`, 이름 열 60px 말줄임, 머리글은 두 줄로 위에 달이 바뀔 때의 월, 아래에 일을 적고 전체 날짜는 `aria-label`로 준다. `caption`과 `scope`를 둔다. 전신은 같은 8칸의 행이다. 달력 주 기준이라 근육 균형과 숫자가 다를 수 있음을 적는다. done=false·유산소·워밍업·실패 세트는 근육 균형과 같이 뺀다.
- 데이터는 숫자 줄과 같은 읽기에서 함께 받는다. 다 읽기 전에는 카드를 그리지 않고, 읽기 실패 시 그 카드만 빠진다.

### 없앨 것

`SummaryEntry` 호출과 import는 `[원본]` 주석으로 막는다. `src/frontend/app/stats/summary/page.tsx`는 `redirect("/stats")`로 바꾼다. 오프라인에서는 서비스 워커가 먼저 넘긴다. 앱 교체 점검은 대기열을 보여 줄 화면이 없으므로 보내 보기만 하고 막지 않는다.

## 작업 단계

- [x] `src/core/src/domain/exerciseProgress.ts`와 단위 시험
- [x] 저장소 함수 두 개
- [x] 카드 두 개와 `KpiRow.sub`
- [x] `src/frontend/app/components/analytics/StatsClient.tsx` 배치, 입구 제거, 직전 대비
- [x] `/stats/summary` 넘기기, 셸 목록 정리
- [x] e2e 추가와 영향받는 시험 정리
- [x] 라이트·다크·360px 화면 확인

**완료 기준:** `make verify` 통과, 새 e2e와 관련 e2e 통과.

## 수용 기준

SRS-101의 수용 기준을 모두 만족한다.

## 테스트 계획

- **단위:** 2회 미만 제외, 0.5kg 미만 변화 제외, 오름·내림 정렬과 개수 제한, 그대로인 종목의 4주·3회·28일 경계, 0.5kg 미만 갱신 무시, 주 경계(일요일 밤·월요일 0시), 보조근 0.5, 워밍업 제외.
- **e2e:** 입구 없음, `/stats/summary` → `/stats`, 분석 탭에 코치 보내기 없음, 브라우저 시계를 옮겨 남긴 기록으로 오른 종목·그대로인 종목·주간 세트 숫자 확인, 기간 변경 시 종목 변화가 바뀜, 이번 주 0회에도 기간 무관 카드 보임, 360px 넘침 없음, 라이트·다크 칸 대비 4.5 이상. 서버 API로 만든 요약 카드의 DM·알림 열기, 코치 리포트, 해지 거부.
- **회귀:** `src/frontend/e2e/analytics.spec.ts`, `src/frontend/e2e/ad-slots.spec.ts`, `src/frontend/e2e/coaching.spec.ts`, `src/frontend/e2e/declutter-summary.spec.ts`.

## 위험·주의

- `src/frontend/e2e/opengym-summary.spec.ts`를 건너뛰면 오프라인 전송·계정 전환 시 화면 시험이 빠진다. 대기열 1회 전송과 계정 전환은 `src/frontend/e2e/summary-card.spec.ts`로 옮겼다.
- 대기열 실패를 알려 주던 곳이 페이지와 함께 사라진다. 옛 앱에서 오프라인으로 보내고 업데이트 전에 전송하지 못한 경우만 해당하며, 코칭 재설계 때 대기열과 함께 정리한다(REV-029 보류).
- 같은 종목에서 기구 변형을 바꾸면 추정 1RM이 달라 보일 수 있다. 종목 상세 추세와 같은 기준이며 이번에는 나누지 않는다.
- 첫 값과 마지막 값 비교라 마지막 날이 가벼운 운동이면 「내린 종목」에 뜰 수 있다. 값을 그대로 보여 주고 평가 문구를 쓰지 않는다.
- 분석 탭이 전체 세트를 한 번 더 읽는다. 기간 변경마다 이미 최근 PR이 전체를 읽고 있어 같은 수준이다.
