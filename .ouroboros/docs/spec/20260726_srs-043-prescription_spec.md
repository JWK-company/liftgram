# SRS-043 처방 어휘 + 세션 처방 렌더 — 구현 스펙

- 등급: **Feature** (파일 8+, DB 마이그레이션, 도메인+UI) · 근거: SRS-043(Approved)·SAD-021·ADR-028
- 원칙: 처방 쓰기 주체 = 사람(루틴 에디터·프리셋)만. 알고리즘 자동 변경 경로 없음(ADR-028). 제안은 reasonKey와 함께 표시·무시 가능. 처방 없는 세트 = 기존 UI/동작 100% 유지(옵트인 레이어).

## 1. 데이터 모델 (DB v16 — additive only)

| 테이블 | 컬럼 | 타입 | 의미 |
|---|---|---|---|
| routine_exercises | `prescription` | string(JSON)·opt | `PrescribedSet[]` — 세트별 처방(사람 작성) |
| workout_exercises | `prescription` | string(JSON)·opt | 세션 시작 시 루틴에서 복사(cardio_target 선례) |
| set_logs | `set_type` | string·opt | 'warmup'\|'top'\|'backoff' (null=비처방) |
| set_logs | `target_rir` | number·opt | 목표 RIR(0~6) |

- `PrescribedSet = { setType: 'warmup'|'top'|'backoff'|'normal', targetRir: number|null, repMin: number|null, repMax: number|null, loadHint: 'light'|'medium'|'heavy'|null }`
- 새 테이블 금지(v14 선례 — createTable 부팅 리스크). @json + sanitizer(`sanitizePrescription`) 패턴(_sanitizers.ts 선례).
- set_type='warmup'이면 is_warmup=true 미러(기존 W 라벨·볼륨 제외 로직 재사용).

## 2. 도메인 (app/src/domain/prescription.ts — 순수함수)

- `parsePrescription/sanitizePrescription` — 방어적 파싱(불량 JSON→null).
- `suggestNextSetWeightKg({ prevWeightKg, prevType, nextType }) → { weightKg, reasonKey } | null`
  - 캐스케이드 상수(문서화): warmup→warmup ×1.12 / warmup→top ×1.35 / top→top ×1.0 / top·backoff→backoff ×0.85. 결과 0.1kg 반올림. prev≤0·NaN → null.
  - reasonKey: `prescription.reason.warmupLadder` 등 i18n 키.
- `restSecondsForSetType(type, fallback)` — warmup 45 / top 180 / backoff 120 / normal·null → fallback.
- `PRESCRIPTION_RIR_MIN=0, MAX=6` 클램프.
- 테스트: 캐스케이드 규칙·경계(0/음수/NaN·단위 무관 kg 순수)·파서 불량 입력·클램프.

## 3. 리포지토리

- routineRepository: `setPrescription(routineExerciseId, PrescribedSet[]|null)` — null=처방 제거.
- workoutRepository:
  - `startWorkoutFromRoutine`: prescription 복사 + 프리레이 세트 수 = prescription.length(있으면) else target_sets. 각 프리레이 세트에 set_type·target_rir 기입, warmup은 is_warmup=true. 무게 프리필 우선순위는 기존 유지(prev→target→snap→기본).
  - `getWorkoutUndoneSetCount(workoutId)` — 미완료(done=false) 세트 수(미완료 종료 확인 문구용).
  - addSet: 변화 없음(추가 세트=비처방 normal).

## 4. UI

### ExerciseBlock (세션)
- SetRowEdit: `set.setType`/`set.targetRir` 존재 시 — 타입 칩 라벨: warmup='W'(기존)·top='T'·backoff=숫자 유지, 칩 아래 `RIR n` 미니 라벨 + repMin-repMax 목표 라벨(`4-7`) 표시.
- **수동 타입과의 충돌 정책(qa c1 반영)**: 기존 타입 메뉴(W/D/F)는 지금처럼 is_* 만 변경. 라벨 우선순위 = is_warmup/is_drop/is_failed(수동) > set_type(처방). 'T'는 set_type='top'이고 수동 타입 미설정일 때만. top/backoff도 일반 세트 번호 카운트에는 포함(총 세트 수 일관). RIR·반복범위 라벨은 set_type 기준으로 항상 표시(수동 변경과 독립).
- **행 잠금**: isDone=true → 무게·횟수·부분반복 TextInput `editable=false`(시각은 기존 setRowDone 유지). 재탭(체크 해제) 시 편집 복원.
- **휴식**: onRestStart 시 `restSecondsForSetType(set.setType, restSeconds)` 사용(비처방=기존 종목 휴식값).
- **캐스케이드 제안(qa c1 반영 — 위치 확정)**: 세트 done 시 다음 미완료 처방 세트의 **행 아래 한 줄**로 제안 표시(`제안 22.4kg — 웜업 단계 상향 · [적용]`). prev 칩은 그대로 유지(정보 소실 없음). 자동 덮어쓰기 금지·탭 적용·무시 가능. 세션 로컬 상태.
- **미완료 종료**: confirmFinish 메시지에 미완료 세트 수 표시(기존 확인 모달 유지 — `getWorkoutUndoneSetCount`).

### RoutineEditorScreen (루틴)
- 종목 행에 "처방" 진입(칩/버튼) → 모달: 세트 목록(행 추가/삭제), 행마다 타입(일반/웜업/탑/백오프)·RIR(0~6, 빈=없음)·반복범위(min·max). 저장→setPrescription. 처방 있으면 target_sets와 무관하게 처방 세트 수가 프리레이 기준(안내 문구 1줄).

## 5. i18n (ko/en)
`session.rirLabel`, `session.suggestChip`, `prescription.reason.*`, `routines.prescription*`(모달 라벨), `session.finishUndoneCount`.

## 6. 검증 (SV)
- `cd app && npm run typecheck` · `npm test`(신규 prescription.test.ts 포함) 통과.
- 회귀: 처방 없는 기존 루틴/세션 플로우 UI 불변(수용 기준).

## 파일 체크리스트
1. src/db/schema.ts (v16) · src/db/migrations.ts
2. src/db/models/_sanitizers.ts · RoutineExercise.ts · WorkoutExercise.ts · SetLog.ts
3. src/domain/prescription.ts (신규) · src/domain/index.ts (export)
4. src/domain/__tests__/prescription.test.ts (신규)
5. src/data/routineRepository.ts · src/data/workoutRepository.ts
6. src/features/session/ExerciseBlock.tsx · ActiveWorkoutScreen.tsx
7. src/features/routines/RoutineEditorScreen.tsx
8. src/i18n/locales/ko.ts · en.ts

모든 신규/수정 블록에 `@plm SRS-043` 주석.
