# /qa spec — 운동 중 보조 (20261027_session-assist)

- 검토일: 2026-10-27 · 대상: `spec/20261027_session-assist/spec.md` · SRS-061~063 · 코드 대조(읽기 전용)
- 확정 결정 D1~D5 는 다시 따지지 않았다.

## 참여 전문가
| 역할 | 관점 |
|---|---|
| 오프라인 데이터 아키텍트 | 로컬 저장소 쓰기·캐시 재계산·동기 |
| 코칭 경로 감사관 | 트레이너 처방 서버 왕복(proto·Go·jsonb) |
| 운동 화면 QA 엔지니어 | 입력 중 값·탭/길게 누르기·회귀 |

## 발견
| # | 심각도 | 근거 | 내용 | 수정안(스펙 반영) |
|---|---|---|---|---|
| Q1 | 높음 | `backend/internal/coaching/prescription.go:33-52` `SanitizePrescription` 이 struct 필드만으로 다시 만든다 · `service.go:400-412` 가 그 결과로 payload 를 덮어씀 | 트레이너가 처방을 한 번이라도 고치면 회원이 직접 넣은 `loadBasis/loadPct/loadKg` 가 **지워진다**(모르는 필드 드롭). 리포트 파싱(`report.go:53,320`)도 같은 struct | Go `PrescribedSet` 에 `LoadBasis·LoadPct·LoadKg`(json `loadBasis·loadPct·loadKg`) 추가 + Sanitize 범위 검사 + **왕복 테스트**(회원 % 처방 → 트레이너 RIR 만 수정 → % 유지) |
| Q2 | 높음 | `workoutRepository.ts:1210-1224` `historicalSnapshotForExercise` 는 「현재 운동 제외 모든 완료 운동」을 본다 | 과거 세트 편집 뒤 `pr_count` 재계산에 그대로 쓰면 **미래 운동까지 과거로 취급**해 PR 이 0 이 된다 | `countWorkoutPrs` 는 `completedAt < 대상.completedAt` 인 운동만 이력으로 쓰는 새 이력 함수(기존 함수 보존) · 시간순 재계산 테스트 |
| Q3 | 높음 | `SetRowEdit.tsx:122-145` 무게·횟수는 로컬 state, blur 때 저장 | 그룹 완료가 다른 멤버의 **입력 중 값**을 놓친다(스펙에 있음) — 추가로, 누른 행 자신의 값은 `onToggleDone(next, kg, reps)` 로 오지만 저장 전 | draftRegistry 에 누른 행 포함 · `completeSupersetRound` 가 값 반영 후 done · e2e 「입력만 한 75kg」 |
| Q4 | 중간 | `getExercisePR` 반환 `weightKg` = **유효 무게**(어시스트·맨몸은 체중 반영) | 칩 탭으로 그 값을 입력 칸에 넣으면 어시스트 종목에서 잘못된 입력 무게 | `getExercisePRs` 가 `inputWeightKg`(원 입력)과 `effectiveKg` 를 따로 준다 · 채움은 입력 무게(+배수 환산) |
| Q5 | 중간 | `ExerciseBlock.tsx:317-347` cascade 는 **제안 칩**(덮어쓰지 않음) | 스펙의 「프리레이 값 그대로일 때만 채움」은 블록 재마운트(화면 이동) 뒤 기준값을 잃는다 | 기준값 = 세트 레코드의 프리레이 무게를 **세트 생성 시 값과 같고 done=false · 사용자가 편집하지 않음** 으로 판정: `updated_at == created_at` 비교(편집하면 updated_at 이 바뀜) — 메모리 기억 대신 |
| Q6 | 중간 | 그룹 완료 때 `evalLiveSetPr` 를 멤버별로 부르면 축하 토스트가 여러 개 겹침 | — | 멤버 PR 을 모아 토스트 한 번(종목 이름 나열) |
| Q7 | 낮음 | 기록 상세는 지금 세트 편집이 없음(`WorkoutDetailClient.tsx`) | 편집 시트 신규 — 유산소 세트 편집은 범위 밖 | 근력 세트만 편집, 유산소는 지우기만 |
| Q8 | 낮음 | 1RM% 반올림 단위 | 덤벨 2kg 간격 헬스장도 많음 | v1 은 바벨류 2.5·그 밖 1kg 고정, 단위 설정은 후속 |

## 총평: **조건부 통과** — Q1~Q3(높음)을 spec 「/qa spec 반영」에 넣고 execute 진행.
