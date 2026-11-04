# SPEC-022 — 광고 자리와 운동 중 가드 — 공용 슬롯 · 판정 함수 · 관리자 미리 보기 · 실광고 없음

> 타입 Spec · 그룹 할일/광고-자리 · ADStudio가 `SPEC-022.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-050, SRS-098

## 목표

실광고 없이 광고 자리를 먼저 확보한다. 공용 슬롯 하나로만 광고를 그리고, 운동 중에는 슬롯이 스스로 비게 하며, e2e 로 이를 지킨다. 사용자에게는 아무것도 보이지 않고, 관리자는 미리 보기로 위치를 확인할 수 있다.

등급 판정: Feature — 새 도메인 함수·공용 컴포넌트와 화면 6곳을 건드린다. REV-024 를 반영해 범위를 줄였다.

## 범위

바꿀 파일:

- `src/core/src/domain/adPolicy.ts` (새 파일)
- `src/core/src/domain/__tests__/adPolicy.test.ts` (새 파일)
- `src/frontend/lib/adPreview.ts` (새 파일)
- `src/frontend/app/components/ads/AdSlot.tsx` (새 파일)
- `src/frontend/app/components/session/WorkoutSummary.tsx`
- `src/frontend/app/components/feed/FeedClient.tsx`
- `src/frontend/app/components/routines/RoutinesClient.tsx`, `src/frontend/app/components/analytics/StatsClient.tsx`, `src/frontend/app/components/analytics/HistoryClient.tsx`, `src/frontend/app/exercise/[id]/page.tsx`
- `src/frontend/app/components/SessionProvider.tsx`
- `src/frontend/app/components/staff/StaffClient.tsx`
- `src/core/src/i18n/locales/ko.ts`, `src/core/src/i18n/locales/en.ts`
- `src/frontend/e2e/ad-slots.spec.ts` (새 파일)

범위 밖: AdMob 연결 · 서포터 결제와 혜택 · 동의 · 개인정보처리방침 · 빈도 규칙(첫 7일·하루 상한·서포터 · 실광고를 붙일 때 저장소와 함께 만든다).

## 설계

**가드:** `adGuard({ activeKnown, activeWorkoutId })` 는 운동이 없다고 읽어 냈을 때만 참이다. 미리 보기와 실광고 모두 이 판정을 거친다.

**운동 상태:** `activeLoaded` 는 읽기에 실패해도 켜지므로, 성공했을 때만 켜지는 `activeKnown` 을 `src/frontend/app/components/SessionProvider.tsx` 에 더한다. 기존 `activeLoaded` 의 뜻은 바꾸지 않는다.

**피드 간격:** `feedAdAfter(index)` 는 0부터 세어 5, 11, 17번 뒤에서 참이다. 슬롯 열쇠는 순번이다.

**배치:** 페이지가 아니라 각 화면의 내용 분기 안에 둔다. 빈 목록과 로딩에는 그리지 않고, 탭바에 붙지 않는다. 완료 요약은 종목별 기록과 부가 행동 줄 사이에 두고 세트가 있을 때만 그린다.

**슬롯 상태:**

| 상태 | 조건 | 화면 |
| --- | --- | --- |
| 꺼짐 | 기본값 | 요소 없음 |
| 미리 보기 | 관리자가 운영 탭에서 켬(이 기기에만 저장) | 점선 칸 「광고 자리」 |
| 실광고 | 없음. 실광고를 붙일 때 이 분기를 추가한다 | 해당 없음 |

일반 사용자에게는 미리 보기 줄이 없다. 저장 값을 직접 넣어도 슬롯이 관리자 역할을 확인한다. 칸은 큰 배너 크기(320×100)이고 「광고」 표시와 위아래 여백을 갖는다.

## 작업 단계

단계 1개.

- [x] `src/core/src/domain/adPolicy.ts` 와 단위 시험 · `activeKnown`
- [x] `src/frontend/lib/adPreview.ts` · `src/frontend/app/components/ads/AdSlot.tsx`
- [x] 자리 6곳 배치
- [x] 운영 탭 미리 보기 줄
- [x] e2e: 꺼짐 0개 · 미리 보기에서 자리별 표시 · 운동 중 0개 · 일반 사용자 저장 값 무시
- [x] 화면 사진으로 배치 확인 · `make verify`

완료 기준: 아래 수용 기준을 시험으로 확인한다.

## 수용 기준

SRS-098 중 이번 범위:

- 기본 상태에서 어느 화면에도 광고 요소가 없다.
- 슬롯은 `AdSlot` 하나로만 그려진다.
- 운동 세션 화면과 운동 중의 다른 탭에서 광고 요소가 0개다. e2e 가 미리 보기를 켠 관리자로 지킨다.
- 운동 상태를 읽지 못하면 비운다. 단위 시험이 지킨다.

SRS-098 의 「AdMob 테스트 광고」와 「첫 7일·구독자·하루 상한」은 실광고 스펙에서 지킨다.

## 테스트 계획

- **단위:** `src/core/src/domain/__tests__/adPolicy.test.ts` — 가드와 피드 간격.
- **e2e:** `src/frontend/e2e/ad-slots.spec.ts` — 수용 기준의 화면 조건.
- **수동:** 미리 보기 사진으로 자리가 내용을 가리지 않는지 확인.

## 위험·주의

- **빈 칸 노출:** 자리가 꺼져 있을 때 여백이 남으면 안 되므로 요소 자체를 그리지 않는다.
- **자리가 바뀔 수 있음:** AdMob 배너는 웹뷰 위 네이티브 층이라 이 자리에 그대로 들어가지 않을 수 있다. 시범은 ADR-050 의 실광고 착수 점검에서 한다.
- **DOM 시험의 한계:** 네이티브 광고로 가면 지금 e2e 는 광고를 보지 못한다. 실광고 스펙에 숨김 호출 시험을 더한다.
- **건너뜀:** e2e 는 테스트 DB 가 없으면 건너뛴다. 실행 기록에 건너뜀 0건을 남긴다.
- **가격 전제:** 가격은 ADR-050 의 수수료 위험을 그대로 안고 간다. 이번에 코드로 넣지 않는다.
