# Repset — 근력운동 기록 앱 (Phase 0 코어)

Hevy 벤치마크 기반 **로컬-우선(offline-first)** 근력운동 로거. React Native(Expo) 단일 코드베이스. 기획 산출물(`../.ouroboros/docs/`)의 SRS/SAD/ADR을 구현하며, 소스 곳곳의 `@plm SRS-NNN` 주석이 요구사항과 코드를 잇는다(`/plm-hub:codescan`으로 PLM 딥링크).

> **포지셔닝**: "웰니스" 기록 도구 — 질병의 진단·치료·예방을 표방하지 않는다(ADR-006). 추정 1RM 등 모든 수치는 "추정치"로 라벨링.

---

## 스택 (ADR 확정)

| 영역 | 선택 | 근거 |
|------|------|------|
| 프레임워크 | React Native + Expo SDK 56 (RN 0.85, React 19) | ADR-001 크로스플랫폼 |
| 로컬 DB | WatermelonDB (SQLite + JSI) | ADR-003 대량 세트로그·반응형·동기 친화 |
| 동기 | 로컬-우선, SetLog append-only + 메타 LWW | ADR-002 (엔진은 Phase 1) |
| 1RM | Epley `w×(1+reps/30)` | ADR-010 단일 SSOT |
| 네비게이션 | React Navigation v7 (native-stack + bottom-tabs) | — |
| 결제 | RevenueCat | ADR-009 (Phase 7) |

---

## 실행

```bash
cd app
npm install
```

WatermelonDB는 네이티브 모듈(JSI)이라 **Expo Go·웹에서 동작하지 않는다.** dev client를 빌드해야 한다:

```bash
npx expo prebuild            # ios/ android/ 생성 (app.json plugins 적용: build-properties, watermelondb)
npx expo run:ios             # 또는: npx expo run:android  (Xcode/Android SDK 필요)
```

> 이 저장소를 만든 환경에는 Xcode/CocoaPods가 없어 네이티브 실행은 사용자 머신에서 수행한다. 코드는 그에 맞춰 작성됨.

### 검증 (네이티브 불필요)

```bash
npm run typecheck   # tsc --noEmit  (전체 0 에러 유지)
npm test            # 순수 도메인 단위테스트 (Epley·볼륨·PR·플레이트·단위)
```

순수 도메인 로직(`src/domain`)은 RN 의존성이 0이라 `tsx + node:test`로 즉시 검증된다.

---

## 아키텍처

레이어 분리 — UI는 DB를 직접 만지지 않고 **repository**만 호출(스펙 "데이터 레이어 분리").

```
src/
  domain/        순수 비즈니스 로직 (RN 무관 · 테스트됨): 1RM·볼륨·PR·플레이트·단위·웰니스·타입·라벨
  db/            WatermelonDB: schema · 7 models · database · 반응형 hooks
  data/          repository (exercise/routine/workout/analytics/user) + 운동 시드
  components/    공용 UI 키트 (Screen/Button/Card/차트/입력 …)
  theme/         디자인 토큰 (다크)
  navigation/    파라미터 타입 + Root/Tab 네비게이터
  state/         user · session 컨텍스트
  features/      화면 (exercises · routines · session · analytics · profile)
  utils/         picker 레지스트리 · id
```

### 데이터 모델 (7 엔티티)
`UserProfile · Exercise · Routine · RoutineExercise · Workout(세션) · WorkoutExercise · SetLog`. 무게는 항상 **kg 정규화 저장**, 표시 단위는 표현 계층에서 변환. WatermelonDB의 `_status/_changed`가 동기 변경 추적을 담당(Phase 1 동기 엔진 대비).

---

## Phase 0 범위 (RM-001 코어 클론)

구현: 운동 카탈로그(검색·근육군/기구 필터·커스텀·대체운동) · 루틴 빌더(슈퍼셋·순서·복제) · 라이브 세션(세트 로깅 ≤3탭·직전기록 자동표시·휴식 타이머·플레이트 계산·일시정지·크래시 복구) · 종료 요약(볼륨·시간·PR) · 분석(볼륨·추정1RM·PR·근육군 분포·추세) · 프로필/설정 · 인증 스텁.

**의도적 Phase 0 단순화 (네이티브 표면·검증가능성 우선):**
- 차트 = View 기반 경량(추후 `react-native-svg`로 교체) · 루틴 reorder = 버튼식(추후 드래그) · 인증/동기 = 로컬 스텁(`@phase-1-backend`/`@phase-1-sync` 주석) · 결제 = 미포함.

---

## 추적성

코드 ↔ 요구: 각 모듈 헤더의 `// @plm SRS-NNN` 주석. 빌드 후 기획 워크플로우에서 `/plm-hub:codescan` 실행 시 Code 아티팩트·`realizes` 관계·`code_refs`가 PLM에 생성된다.
