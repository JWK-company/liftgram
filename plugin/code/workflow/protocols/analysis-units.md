# 프로토콜: 용도별 분석단위 (Analysis Units)

> 작업 **용도**에 따라 분석의 초점·산출 아티팩트·추적 규칙이 달라진다. `/spec` Step 0에서 용도를 판정해 해당 분석단위를 선택하고, Step 2.5(추적성)·Step 3(복잡도)·Step 5(문서)에 적용한다.
> 목적: code 작업을 plan의 아티팩트 체계에 **용도에 맞게 일관되게** 편입.

## 분석단위 표
| 용도(unit) | 트리거 | 주 산출/연결 아티팩트 | G0(요구선행) | 기본 granularity | 분석 초점 |
|------------|--------|----------------------|--------------|------------------|-----------|
| **feature** 기능구현 | 새 동작·기능 | SRS(FR)→SAD→Code(`realizes`) | **적용** | component/function | 요구 해소·구현 매핑·@plm 계획 |
| **refactor** 리팩터 | 동작 불변 구조개선 | 기존 Code·SAD(불변) | 면제 | (기존 유지) | 코드 보존규칙·동작 동등성·기존 @plm 유지 |
| **bugfix** 버그수정 | 결함 수정 | 위반 SRS 참조·Code | 면제 | function | root-cause·회귀 테스트·위반 요구 식별 |
| **perf** 성능 | 속도/자원 | SRS(kind=NFR)→Code | 적용(NFR) | component | 벤치마크 전/후·NFR 수용기준 |
| **infra** 인프라/빌드 | 배포·CI·환경 | SAD/ADR | 면제(FR무관) | system/module | 아키텍처 영향·결정(ADR) 기록 |
| **research** 연구/스파이크 | 불확실 탐색 | Research(비추적)→ADR 후보 | 면제 | — | 결론을 SRS/SAD/ADR로 환원 |
| **design** 설계 | 상위 설계/결정 | SAD(`/design`)·ADR(`/decision`) | — | system/module | plan `/design`·`/decision` 연계 |
| **domain:game** 게임개발 | 게임 시스템 | URS(플레이어 니즈)→SRS(게임시스템)→SAD(엔진 아키텍처)→Code | 적용 | module/component/function | 게임 디자인→요구 환원·시스템별 SRS·UE 모듈↔Code |

## 선택 규칙
- Step 0에서 요청 텍스트·범위로 용도를 판정(복수 가능 — 주 용도 1개 + 보조). 불명확하면 AskUserQuestion.
- 선택된 unit의 **G0 적용 여부**가 Step 2.5의 요구 선행 게이트를 결정.
- unit의 **granularity 기본값**이 PLM Code 아티팩트 granularity 및 `@plm` 매핑 단위를 가이드.
- unit의 **분석 초점**이 해당 protocol을 추가 호출(예: bugfix→`root-cause.md`, refactor→코드 보존규칙).

## 일관성 원칙
- 모든 unit은 **추적 매핑 표**(심볼↔SRS/SAD)를 spec에 남긴다(연결 없으면 "추적 대상 아님" 명시).
- feature/perf/game 등 **G0 적용 unit**은 요구(SRS)가 선행해야 코드 작성(plan-first).
- refactor/bugfix는 요구 불변이므로 기존 추적을 **보존**(새 SRS 발급 금지, 기존 @plm 유지).
