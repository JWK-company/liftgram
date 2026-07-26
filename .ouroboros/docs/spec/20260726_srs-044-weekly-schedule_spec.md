# SRS-044 주단위 루틴 스케줄 + 블록·디로딩 — 구현 스펙

- 등급: **Feature** · 근거: SRS-044(Approved)·SAD-021 ②·ADR-028
- 원칙: 스케줄 미사용 시 기존 경험 100% 유지(하위호환). 디로딩 볼륨 자동 산출 없음 — 표시만.

## 1. 데이터 (DB v17)
- `user_profiles.weekly_schedule` (string JSON·opt) — 로컬 단일 사용자 프로필 선례(my_gear).
- `WeeklySchedule = { days: (routineId|'rest'|null)[7](월=0), blockWeeks: number|null(운동주. null=블록 없음), blockStartAt: number|null(ms) }`

## 2. 도메인 (domain/weeklySchedule.ts — 순수)
- `sanitizeWeeklySchedule(raw)` 방어 파싱(길이 7 보정).
- `todayPlan(schedule, now)` → routine|rest|none (요일 매핑, 월=0. JS getDay 일=0 보정).
- `currentBlockWeek(schedule, now)` → { week(1-based), isDeload, cycleWeeks } | null — cycle = blockWeeks+1(디로딩 1주), 모듈로 롤오버(blockStartAt 불변=이력 보존). KR 무DST 전제로 ms 나눗셈(문서화).
- 테스트: 요일 매핑(일요일 경계)·모듈로 롤오버·디로딩 판정·불량 입력.

## 3. 저장 (userRepository)
- UserProfile `@json('weekly_schedule', sanitizeWeeklyScheduleJson)` + UserSettingsPatch.weeklySchedule + updateUserSettings 반영.

## 4. UI (WorkoutTabScreen 헤더)
- **WeeklyScheduleCard**: 스케줄 있으면 — 주차 라벨(`N주차`·디로딩 주는 강조 배지) + 7칩 스트립(요일·루틴 축약/휴식, 오늘 강조) + 오늘 운동 시작(휴식일은 안내) + 편집(연필). 없으면 — "주간 스케줄 만들기" 엔트리.
- **편집 모달**: 요일 7행(탭→Alert: 루틴 목록/휴식/비움 — 코드베이스 Alert 선택 관례) + 블록 주기 선택(없음/4+1/5+1/6+1) + 저장. blockStartAt: 최초 설정·주기 변경 시 now, 그 외 유지.
- 오늘 운동 시작은 기존 guardActive→doStartFromRoutine 재사용.

## 5. i18n ko/en · 검증
- typecheck·test(신규 weeklySchedule.test.ts) 통과, 스케줄 미설정 시 기존 화면 불변.
- qa c1 자체지적 반영: ①문서에 요일 기준(월=0) 명시 ②주기 변경 시 blockStartAt 리셋 정책 명시. c2 치명 0.

파일: schema.ts(v17)·migrations.ts·UserProfile.ts·_sanitizers.ts·userRepository.ts·domain/weeklySchedule.ts(+test)·domain/index.ts·WorkoutTabScreen.tsx·ko/en.ts — 전부 `@plm SRS-044`.
