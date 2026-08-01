# QA 리뷰 — 운동 카탈로그 대확장 spec (Feature · /qa spec)

- **대상**: `.ouroboros/docs/spec/20260801_exercise_catalog_expansion/` (2026-08-01)
- **패널**(작업 성격 기반 동적 구성 · 병렬 리뷰 후 검증자=메인 세션이 코드 실물 대조):
  1. **피트니스 도메인 큐레이터** — 종목 체계·한국 통용 명칭·생체역학 분류 (15 findings)
  2. **데이터 무결성 감사관** — 시드 계약·키 충돌·멱등·테스트 강제 (9 findings)
  3. **콘텐츠·라이선스 QA** — 미디어 매칭·스텝 품질·표기 일관성 (10 findings)
- **판정 합계**: **채택 24 · 보류 1 · 기각 3** (중복 지적 병합 기준)

## 채택 (spec 반영 완료) — 핵심

| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| 1 | **high** | **'파워 클린' 신규 판정 오류** — 기존 '바벨 클린'의 nameEn이 이미 'Power Clean'(seed:154, 코드 대조 확정). 신규 발급 시 top-up 미생성 + syncSeedNames가 기존 nameKo를 자동 rename하여 KEY 계약 파괴. 3인 전원 일치 | 스킵 재판정 — 표에서 삭제, TSV·원칙 5에 사례 기록 |
| 2 | **high** | **substitutes.seed 죽은 키 14·죽은 값 65 실존**(메인 세션 실측 스크립트로 확정 — '런지'·'인클라인 프레스'·'프리처 컬' 등 베이스명 잔존, syncSubstitutes 정확일치라 침묵 드롭 중인 **현재진행형 실버그**). 계획된 테스트로는 미검출 | Phase 1에 죽은 키 선행 정리 + 무결성 테스트 5종(SUB/FINDER/RAW_MEDIA ⊆ seed 등) **시드 추가 전 선행 작성** |
| 3 | **high** | free-exercise-db **매칭률 실측 ~23%(정확)·~40%(관대)** — 스펙의 60~70% 추정 과대. 오매칭 후보 다수('Plank Push Up'→'Push Up to Side Plank' 등) | Phase 3 재산정(자체 작성 ~90종+) + 정확일치 외 전건 사람 검수 + negative 규칙 |
| 4 | **high** | **steps-only 렌더 경로 부재** — RAW_MEDIA는 s/e 필수, ExerciseTipPanel 기본 mode='media' → 이미지 없는 종목은 깨진 박스. 해당 파일들이 영향 범위 누락 | exerciseMedia.ts·ExerciseTipPanel.tsx를 영향 범위에 추가, s/e optional + 초기 mode='steps' 명세, e2e 케이스 추가 |
| 5 | high | '링 딥스' TSV 신규 판정이 표에서 누락 | 가슴 표 복원(13종) |
| 6 | med | 패턴 'thrust'는 MovementPattern union에 없음 + 괄호 엔트리는 폴백 자동 도달 | hinge(폴백—매핑 불요)로 정정, 표 규칙에 폴백 원칙 명시 |
| 7 | med | 리버스 컬 (덤벨/케이블) primary=biceps가 기존 '리버스 바벨 컬'(forearms)과 모순 + 원칙 2의 '기존 괄호 선례' 주장 오류 | forearms로 통일·전완 섹션 이동, 원칙 2 '신설 계열' 명시 |
| 8 | med | 수치 불일치(~145 vs 실제 153, 187 vs 시드 실물 183, 햄둔 14 vs 16) | 전량 실측 정정: 신규 **153**, 183→**336**, 총수 하한 테스트 |
| 9 | med | 스모 스쿼트 '맨몸=변형 축' — bodyweight는 축이 아님 | '맨몸=기본 버킷 무게 0' 정정 |
| 10 | med | '사이드 밴드'→'사이드 벤드'(통용 표기 + band 축과 혼동) | 반영 |
| 11 | med | 패러럴 바 니/레그 레이즈 nameEn(Captain's Chair)이 다른 기구 지칭 — 미디어 오매칭 유발 | Parallel Bar Knee/Leg Raise로 통일 |
| 12 | med | 원암 푸시업·네거티브 풀업 별도 엔트리가 원칙 3과 충돌(경계 기준 미명문화) | 원칙 3에 '독립 스킬 칼리스데닉스 예외' 조항 신설 |
| 13 | med | 유산소 15종 시드 정본 부재 + cardioMetricsFor '필요시' 미룸 | 15종 × primary/equipment/지표 정본 표 승격, duration-only 보강 확정 작업화, kind assert |
| 14 | med | 유산소 팁 차단(hasTip=!isCardio) — 스텝 작성 범위 미정의 | '유산소는 미디어·스텝 제외(현행 정책 유지)' 결정 기록 |
| 15 | med | RAW_MEDIA 스텝 카피 기계 게이트 부재 + 고위험 종목 안전 톤 | containsMedicalClaim 전건 테스트 + 안전 안내 톤 가이드(Phase 3) |
| 16 | low | 박스 점프·프로그 점프 lungeStep → squat(양발 플라이오) | 반영(레터럴 박스 점프는 lungeStep 유지) |
| 17 | low | 숄더 탭 primary shoulders → abs(플랭크 계열) | 반영(secondary shoulders) |
| 18 | low | 프론트 레버 레이즈 이중 기재(전신 비고 + 맨몸 표) | 맨몸 표 단일화 |
| 19 | low | HIIT 로마자 nameKo 검색성 | '히트 (HIIT)' 병기 |
| 20 | low | 넥 →other가 시드 230행 '타입 확장 별도 결정' 주석과 모순 | 'neck 확장 안 함' 명시 결정 + 주석 갱신 작업화 |
| 21 | low | Phase 2 '전건 매핑' 문구 vs 표 '공란=제외' 모순 | '패턴 컬럼 기재분만'으로 정정 |
| 22 | low | 시드·러너 헤더 'nameKo 기준' 낡은 주석 | Phase 1 정정 작업 추가 |
| 23 | low | band '코드 1곳' → KEYS+LABELS 2곳 + 라벨 완비 테스트 | 반영 |
| 24 | low | 요가·필라테스 kind cardio 의미론 | '시간 기록형 실용 배정' 근거 명기 + Phase 4 라벨 검토 |

## 보류 (1)

- **이명 검색성**(헥스 프레스·업다운 플랭크): 대표명 재선정은 검색 구현(nameEn 매칭 여부) 확인 후 결정 — 주의사항에 보류 기록. side effect(기확정 표기와의 연쇄 변경) 미확인 상태라 스펙 단계 채택 부적절.

## 기각 (3)

- **'(중량)' 흡수 loadMode 백필 필요**(무결성 감사관 high): **기각** — 검증자 코드 대조 결과 resolveLoadMode가 equipment 'bodyweight'에서 자동 파생(volume.ts:5-8), 대상 종목(하이퍼익스텐션·시시 스쿼트·푸시업) 전부 equipment bodyweight. 백필 불필요가 맞음(전문가가 파생 규칙 간과).
- **버드 독 primary abs 이동**: 기각 — 추출 원문(사용자가 쓰던 앱)의 분류가 '둔근'이고 글루트 활성 드릴 통용 분류도 병존. 사용자 기대(이전 앱과 같은 위치) 우선.
- **'커시 런지'→'컬시 런지'**: 기각 — Curtsy의 표준 표기에 '커시'가 부합. 추출 원문 '컬시'는 해당 앱의 음차로 판단(사유 기록).

## 검증 방법 (Step 3)

전문가 주장 중 채택 전 코드 실물 대조 수행: 파워 클린 충돌(seed:154 확인) · substitutes 죽은 키(tsx 스크립트 실측 14/65) · resolveLoadMode 파생(volume.ts) · hasTip 유산소 차단(ExerciseBlock:323) · 시드 실물 수(183) · 넥 제외 주석(seed:230). 매칭률 실측은 콘텐츠 QA 에이전트가 free-exercise-db 실데이터 대조로 산출.

## 다음 단계

스펙 보완 반영 완료 — **/execute로 구현 착수 가능** (Phase 1의 무결성 테스트 선행 작성부터).
