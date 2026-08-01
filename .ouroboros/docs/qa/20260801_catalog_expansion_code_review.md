# QA 리뷰 — 운동 카탈로그 대확장 code (Feature · /qa code · v0.14.0 diff)

- **대상**: 커밋 9a4dc6c·75e0c3e·d7edb25·338247c (73cfdf5..428d36c, app 17파일)
- **패널**(작업 성격 기반 동적 구성 · 워크플로우 3+14 에이전트 — 발견 전건 적대적 검증):
  1. **데이터 무결성·시드 계약 감사관** — 시드/미디어 계약·코드젠 멱등·기존 설치 영향 (4 findings)
  2. **RN-web 프론트 리뷰어** — steps-only 렌더 경로·타입 안전·번들/성능 (2 findings)
  3. **피트니스 도메인 QA** — 패턴/파인더/대체운동 도메인 정합 (8 findings)
- **판정 합계**: **채택 9 · 보류 5 · 기각 0** (적대적 검증 반증 0 — 14건 전건 실재 확인, 일부 PARTIAL 강등)

## 채택 (v0.14.1 반영 완료)

| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| 1 | **high(UX)** | **ExerciseDetailScreen steps-only 미게이트** — 신규 73종 상세 진입 시 빈 240px 애니메이션 박스 + resolveMediaUrl('')이 API 루트로 이미지 GET 2건 + 자체 작성 스텝에 free-exercise-db 크레딧 오귀속 + imageUrl 폴백 차단. TipPanel만 게이트하고 상세 화면 누락(spec 영향범위 밖 소비처) | `hasMediaImages()` 헬퍼를 exerciseMedia.ts로 승격해 TipPanel·상세 화면 공용 게이트. 브라우저 재검증: 클랩 푸시업 상세=스텝만·요청 0·크레딧 없음 / 행 클린=2프레임+크레딧 회귀 없음 |
| 2 | med | gen 스크립트 침묵 삭제 리스크 — @main(mutable) 덤프 rename 시 기존 엔트리가 unmatched로 조용히 강하·삭제 | **기존 생성 키 소실 가드**(prevGen ⊄ emitted → throw) + 헤더에 @sha 핀 권고. 검증은 전부 파일 쓰기 이전으로 이동(비원자성 해소) |
| 3 | low | covered() 베이스 폴백이 전용 supplement를 영구 억압(툴링 함정 — 현행 거동은 기존 폴백 설계 선례와 동일이라 PARTIAL) | targets 필터에 `supplement k+en 보유 시 covered여도 방출` 추가 |
| 4 | low | supplement ↔ 생성 데이터 드리프트 무검증 | catalogGap에 **드리프트 테스트** 신설(supplement 전 키 = RAW_MEDIA 동일 콘텐츠 deep-equal) |
| 5 | low | 시드 정규식 파서 형태 결합(재포맷 시 침묵 탈락) | 파싱 건수 가드(`{ nameKo:` 개략 카운트 대조 → fail-fast) |
| 6 | low | 라잉 넥 컬↔익스텐션 상호 1순위 대체 — 길항 동작 | 상부 승모 인접 계열(페이스 풀·슈러그)로 교체 |
| 7 | low | 비하인드 백 리스트 컬 curl 매핑 — 손목 굴곡이 이두 컬 samePatternNames 오염 | 매핑 제거(기존 리스트 컬 계열과 동일하게 미등록) — spec 표 기재를 도메인 정확성 우선으로 이탈(사유 기록) |
| 8 | low | 슬레드 풀 1순위 대체=슬레드 푸시(동일 기구 — 접근성 대체 무의미) | 목록에서 제거(4개 유지) |
| 9 | low | 리컴번트 바이크 level 누락(Indoor Cycling과 비일관) | `['duration','distance','level']` — spec 표 이탈이나 실내 머신 선례 정합(사유 기록) |

## 보류 (5)

- **RAW_MEDIA +206KB 메인 번들 편입**: 코드 스플릿(dynamic import)은 구조 변경 — PWA 캐시로 완화되는 1회 비용. 다음 성능 사이클에서 판단.
- **패턴 버킷 구성 4건**(데드리프트 하이 풀 hinge 오염 · core/carry 반쪽 버킷 · 플라이오/측면 계열 분열 · fly 가슴·리어 혼재): spec 표 기재 그대로 구현된 설계 판단 — samePatternNames 품질 개선은 패턴 어휘 확장(pull-explosive·plyo 등)이 필요한 기획 사안. 다음 /requirement 사이클 후보.
- (부분) 스키/스노우보드 지표 비대칭·프론트 레이즈 (플레이트) 전용 스텝 공급: spec 정본 유지·콘텐츠 백로그.

## 기각 (0)

적대적 검증 단계에서 반증된 지적 없음(전문가 발견 14건 전건 실재 — 3건은 PARTIAL로 심각도 강등).

## 검증 방법

발견 건마다 독립 검증 에이전트가 실제 코드 Read/Grep으로 반증 시도(REFUTED 기준: 테스트 방어·도달 불가·사실 오류). 채택 반영 후: **154/154 테스트 · tsc 0 · gen 스크립트 멱등 재생성(diff 0) · 브라우저 재검증 2케이스**.

## 다음 단계

v0.14.1 patch 배포(상세 화면 사용자 노출 버그 포함) → /reflect 권장.
