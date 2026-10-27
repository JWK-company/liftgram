# 맥락 — openGym 추천 1~5

## 출처와 결정 이력
- 2026-10-27 openGym(github.com/DuarteSantos8/openGym · opengym.ch) 웹 데모 실측 + 소스·문서 대조 → 보고서 `.ouroboros/docs/report/20261027_opengym-compare_report.html`(artifact QMSNgcb46gXJNhf1vfje7E)
- 사용자: "1~5 전부 requirement부터" → URS-024~026 · UCS-023~025 · SRS-073~082 → SAD-023~025 → ADR-038~043(권장안 전부) → /trace G1·G2 pass
- 스펙 질문 4건 사용자 답 「전부 권장」(2026-10-27) + "다른 세션 코드 작업과 충돌하지 않게 주의"
  - Q1 배포 = 5단계 순차(단계마다 qa code 후 minor) · 로컬 스키마 v26은 1단계에 전부
  - Q2 근육 그림 = 루틴 카드만 기본 켜짐(설정으로 끔) · 운동 중은 '오늘 근육' 버튼 → 시트
  - Q3 체중 주간 변화 = 최근 28일 기록(3개 이상) 선형 회귀 기울기 × 7
  - Q4 CSV 시험 파일 = 공개 형식으로 직접 제작(Strong 쉼표·세미콜론 2종 · Hevy kg·lb), 실제 파일은 생기면 추가 검증

## 병렬 세션 상황(2026-10-27 기준)
- 다른 세션이 **화면 정리(URS-023 · SRS-069~072)** 를 같은 브랜치 `feat/web-stack-tarae`·같은 폴더에서 진행 중.
  - P1 v0.39.0(블록 정리, qa code 반영 커밋 6120a30, 배포 대기) → P2 v0.40.0(요약·기록 상세·**analytics/***) → P3 v0.41.0(홈·피드·**RoutinesClient·WeekSummary·CatalogClient**·칸 시트) → P4 v0.41.x(나머지 점검)
  - 그쪽 작업 범위: frontend `ui/quiet.tsx`(신규 공용 조각 MetaLine·MetaAction·QuietChip·Fold·PrText)·UnitToggle·RecordSlotSelector·session/ExerciseBlock·**SetRowEdit**·WorkoutSummary·**analytics/***·**routines/RoutinesClient·WeekSummary**·feed/*·ShareWorkout·**CatalogClient** · core(getRecentBrands·빠른 운동 자동 이름) · e2e helpers
  - 굵게 표시한 파일이 이번 작업과 겹친다. 스키마 변경은 없다고 그쪽 스펙에 명시돼 있다.
- 배포 스크립트(scripts/deploy-h2500-3.sh)는 작업 트리가 아니라 **커밋된 HEAD**를 별도 worktree에서 내보낸다. 같은 브랜치에 커밋하면 상대 배포에 검토 전 커밋이 섞여 나간다.

## 관련 메모리(파일 메모리 · Ouroboros)
- Ouroboros 검색: 0.85 이상 직접 관련 없음. 참고(0.745) dd56d532 「Phase로 쪼갠 계획에서 마이그레이션 한 파일을 두 Phase가 나눠 쓰면 배포 환경만 조용히 어긋난다」 → 로컬 v26·서버 0017을 각각 한 단계에만 둔다.
- 파일 메모리: Watermelon created 행 충돌(→ADR-042) · LokiJS 비동기 flush(→가져오기 뒤 flush) · optional number null(load_multiplier QA B1) · 검색 NFKC 자모 함정 · 로컬 운영 빌드 e2e 레시피 · 변형 버킷 불변식(ADR-034) · Go 태그 없는 JSON=PascalCase(새 JSON 응답엔 태그+테스트) · nil 슬라이스→SQL NULL(pgx) · user_edited vs updated_at · 오프라인 데이터 손실 교훈 · 배포마다 SemVer(app.json·appInfo 2곳 — 지금은 frontend/package.json 이 기준) · 병렬 세션 프로토콜
