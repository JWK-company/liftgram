<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->

## 세션 상태

| 상태 | 시작 |
|------|------|
| 완료 — 풀 기획 파이프라인 (plan→requirement→design→decision→trace) ✓ | 2026-06-23 |
| 구현 착수 — Phase 0 코어(RM-001) RN 앱 스캐폴딩·핵심 구현 ✓ | 2026-06-25 |
| 기획 정정 — 웹 우선(PWA) 전환: ADR-012 발급(supersedes ADR-001), 브라우저 렌더 확인 ✓ | 2026-06-25 |

> PLM 바인딩: `health-practice-wbi` @ https://jwk-plm.shoi.ch — 토큰 설정됨, 자동 동기(plm-sync) 활성. (2026-06-23)
> ⚠️→✅ 초기 자동 동기 전건 실패(401): `plm_lib.sh`가 토큰을 `. <(grep …)` 프로세스치환으로 로딩했는데 이 실행환경(/dev/fd 제한)에선 무음 실패 → 빈 토큰. here-string 소싱으로 수정 후 **전건 재동기 완료**: 아티팩트 59 + 관계 98 (derives_from 22·elaborates 11·refs 16·informs 26·covers 23). (2026-06-23)
> ✅ `/plm-hub:sync` 수동 일괄 동기 검증: export 대조 결과 드리프트 0(본문·제목·관계 전건 일치) → import 멱등 확인(updated 59·created 0·rel_added 0·skipped 0). 게이트 orphan 0(G1/G2/G3). 모두 Draft. (2026-06-23)

## 활성 기획

| 이름 | 단계 | 비고 |
|------|------|------|
| 헬스앱 (Hevy 클론 → 차별화) | 구현(Phase 0) + 기획 정정 진행 | G1·G2 pass, orphan 0·dangling 0. 노드 60 (URS8·UCS8·SRS15·SAD10·ADR12·RM7) · ADR-012(웹우선) 추가 → /trace 재검증 |

## 작업 범위 (발급 예정/진행 요구사항)

> 본 기획 사이클에서 다루는 문서만 수정. 코드 구현·테스트는 범위 밖.

**산출물**
- PRD: `docs/product/PRD.md` (비추적, 완료)
- Roadmap: RM-001(코어) · RM-002(소셜) · RM-003(AI프로그래밍) · RM-004(책임감루프) · RM-005(카운팅) · RM-006(한국로컬) · RM-007(수익·성장·웰니스) (완료)

**발급 예정 요구사항 (다음 `/requirement`)**
- URS (8): URS-001 빠른 로깅 · URS-002 진척/동기부여 · URS-003 함께 운동 · URS-004 코치(프로그램) · URS-005 지속/책임감 · URS-006 로깅마찰 제거 · URS-007 한국 환경 · URS-008 안전·신뢰(웰니스)
- UCS (8): UCS-001 루틴·세션 수행 · UCS-002 진척 분석 조회 · UCS-003 소셜 활동 · UCS-004 AI 프로그램 생성·주차진행 · UCS-005 그룹챌린지·결석케어 · UCS-006 자동카운팅 기록 · UCS-007 온보딩·마이그레이션 · UCS-008 동의관리·데이터 열람/삭제
- SRS (15): SRS-001 운동DB · SRS-002 루틴빌더 · SRS-003 세트로깅 · SRS-004 세션관리 · SRS-005 분석대시보드 · SRS-006 계정·싱크 · SRS-007 소셜피드 · SRS-008 프로필·PR공유 · SRS-009 AI프로그램생성 · SRS-010 점진과부하·주기화 · SRS-011 책임감루프 · SRS-012 자동카운팅 · SRS-013 한국로컬 · SRS-014 수익화 · SRS-015 웰니스가드레일

**발급된 설계 (SAD)**
- SAD (10): SAD-001 시스템개요/스택 · SAD-002 기록코어 · SAD-003 분석엔진 · SAD-004 오프라인싱크 · SAD-005 소셜·책임감 · SAD-006 AI프로그래밍 · SAD-007 자동카운팅 · SAD-008 한국로컬 · SAD-009 수익화 · SAD-010 웰니스가드레일

**발급된 결정 (ADR)**
- ADR (12): ADR-001 RN채택(→ADR-012가 supersede) · ADR-002 오프라인싱크/충돌 · ADR-003 로컬DB(WatermelonDB·어댑터 분기) · ADR-004 AI하이브리드 · ADR-005 카운팅 온디바이스 · ADR-006 웰니스강제·카피게이트 · ADR-007 좁은부족 책임감해자 · ADR-008 무료+그룹가치 수익화 · ADR-009 구독 RevenueCat · ADR-010 1RM Epley · ADR-011 모듈러모놀리스 · **ADR-012 웹우선(PWA)·Expo Web**

## 게이트 (요구→설계)

| 게이트 | 상태 |
|--------|------|
| G1 요구 (모든 SRS가 URS에 연결) | **pass** (trace_validate 확정 · 2026-06-23) |
| G2 설계 (모든 SAD가 SRS에 연결) | **pass** (trace_validate 확정 · 2026-06-23) |

> 추적 매트릭스: `docs/traceability/matrix.md` (orphan 0 · dangling 0). Approved 전이는 PLM 대시보드에서 사람이 수동(plm-dash.shoi.ch).

## 구현 (Phase 0 — RM-001 코어 클론) · 2026-06-25

> 코드는 `app/`(이 repo 내, 사용자 결정). `.ouroboros/docs`=기획 SSOT, `app/`=구현 분리. CLAUDE.md §8(코드 범위 밖)에 대해 사용자 승인하에 동일 repo `app/`에 배치.

- 스택(ADR 준수): Expo SDK56 RN + WatermelonDB(ADR-003) + react-navigation + Epley 1RM(ADR-010) + 오프라인-우선(ADR-002, 동기 엔진은 Phase1).
- 구조: `app/src/` domain(순수·테스트됨)·db(스키마+7모델)·data(repo 5종+시드)·components·navigation·state·features(12화면).
- 구현 범위: 운동DB(SRS-001)·루틴빌더(SRS-002)·세트로깅/세션(SRS-003/004)·분석(SRS-005)·프로필/인증스텁(SRS-006)·웰니스 가드레일(SRS-015 라벨).
- 검증: `npm run typecheck` 0 에러 · `npm test` 도메인 15/15 통과 · 적대적 코드리뷰(6 리뷰어)→확정 결함 6건 수정(반응성·중복생성·단위변환·워밍업리셋·미들·picker).
- 빌드 검증: `npx expo export --platform ios` 성공(1291 모듈→3.1MB Hermes 번들). 번들링이 잡은 빌드버그 2건 수정 → ① `babel-preset-expo` 직접 의존성 추가 ② WatermelonDB 데코레이터용 class-properties loose 모드(babel.config.js).
- **웹 우선(PWA) 전환·실행 확인 (ADR-012)**: DB 어댑터 플랫폼 분기(웹=LokiJS/IndexedDB `adapter.web.ts`, 네이티브=SQLite/JSI `adapter.ts`) → `expo export --platform web` 번들 성공, **브라우저 렌더 확인**(홈·기록·분석·운동선택 36종 시드 정상). Xcode/CocoaPods 불필요. 웹 후속: `Alert.alert` no-op → 웹 모달 교체.
- 네이티브(iOS/Android)는 후순위 옵션 — `expo prebuild` 시 simdjson pod 중복·full Xcode 필요 등 별도 정비 필요.
- 추적성: 소스 `// @plm SRS-NNN` 주석 다수 → `/plm-hub:codescan`으로 PLM 코드 딥링크 동기(이번 사이클 실행).
- Phase1+ 미구현: 동기 엔진·결제(RevenueCat)·AI프로그래밍(SRS-009/010)·소셜/책임감(SRS-007/008/011)·자동카운팅(SRS-012)·한국로컬 심화(SRS-013).

## 차단 요소

(없음) — IP 귀속 점검(reference/risks.md)은 코딩 착수 전 별도 진행 권고.
