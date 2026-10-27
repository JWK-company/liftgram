// 스키마 마이그레이션 (ADR-003). 컬럼 추가 시 여기 등록(어댑터에 배선됨 — native/web 공통).
import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // v2: 가용 기구 설정(SRS-013 가용기구 기반 추천). 기존 행은 null → @json sanitizer가 []로 정규화.
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'available_equipment', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v3: 루틴 목표를 세션에 복사(세트 프리레이) + 세트 완료 체크(Hevy식 템플릿 세트).
    // 기존 workout_exercises는 target=null(과거 세션이므로 무해), 기존 set_logs는 done=null → '수행됨'으로 취급.
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'workout_exercises',
          columns: [
            { name: 'target_sets', type: 'number', isOptional: true },
            { name: 'target_reps_min', type: 'number', isOptional: true },
            { name: 'target_reps_max', type: 'number', isOptional: true },
            { name: 'target_weight_kg', type: 'number', isOptional: true },
            { name: 'rest_seconds', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'done', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    // v4: 드롭세트 표시(세트타입 W/일반/D/F). 기존 행 is_drop=null → 드롭 아님으로 취급.
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'is_drop', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    // v5: 머신 기구/브랜드 구분(이전기록·PR을 종목×기구로 분리). 기존 행 machine_variant=null → 기본 버킷.
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'routine_exercises',
          columns: [{ name: 'machine_variant', type: 'string', isOptional: true, isIndexed: true }],
        }),
        addColumns({
          table: 'workout_exercises',
          columns: [{ name: 'machine_variant', type: 'string', isOptional: true, isIndexed: true }],
        }),
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'machine_variant_labels', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v6: 종목 변형(기구·그립·팔) 일반화 + 로깅 정밀도 (SRS-028·SRS-029). addColumns만(스키마 전용) —
    // machine_variant→variant_* 데이터 승계는 부팅 시 지연 백필(멱등)로 무손실 처리(migrateMachineVariantToV6).
    // 기존 행: variant_*=null → variant_key=null(기본 버킷) 또는 백필로 equip:<brand> 흡수. machine_variant 컬럼은 유지(레거시 fallback).
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'routine_exercises',
          columns: [
            { name: 'variant_key', type: 'string', isOptional: true, isIndexed: true },
            { name: 'variant_equipment', type: 'string', isOptional: true },
            { name: 'variant_grip', type: 'string', isOptional: true },
            { name: 'variant_arm', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'workout_exercises',
          columns: [
            { name: 'variant_key', type: 'string', isOptional: true, isIndexed: true },
            { name: 'variant_equipment', type: 'string', isOptional: true },
            { name: 'variant_grip', type: 'string', isOptional: true },
            { name: 'variant_arm', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'set_logs',
          columns: [
            { name: 'strict_reps', type: 'number', isOptional: true },
            { name: 'load_adjust_kg', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    // v7: 종목 이미지(#8) + 세션 슈퍼셋 그룹(#20). 기존 행 null(무해).
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'exercises',
          columns: [{ name: 'image_url', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'workout_exercises',
          columns: [{ name: 'superset_group', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v8: 세트별 편측(원암/원레그) — 변형(종목 단위)에서 세트 단위로 분리. 기존 행 arm=null(투암/기본, 무해). @plm SRS-028
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'arm', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v9: 부분반복(깔짝) — 보조·가중(v6) 폐기 대체. 기존 행 partial_reps=null(무해). @plm SRS-029
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'partial_reps', type: 'number', isOptional: true }],
        }),
      ],
    },
    // v10: 유산소(cardio) 통합 — 종목 kind + 세트 시간·거리. 기존 행 null(근력·무해). @plm SRS-030
    {
      toVersion: 10,
      steps: [
        addColumns({
          table: 'exercises',
          columns: [{ name: 'kind', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'set_logs',
          columns: [
            { name: 'duration_sec', type: 'number', isOptional: true },
            { name: 'distance_m', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    // v11: 세트별 그립(over/under/…) — 팔(v8)처럼 그립도 세트 단위로. 기존 행 null(기본, 무해). @plm SRS-028
    {
      toVersion: 11,
      steps: [
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'grip', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v12: 사용자 체중 + 종목 하중모드(맨몸±가중/보조) — 어시스트/가중 볼륨을 체중 기준으로. 기존 행 null(무해). @plm SRS-033
    {
      toVersion: 12,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'bodyweight_kg', type: 'number', isOptional: true }],
        }),
        addColumns({
          table: 'exercises',
          columns: [{ name: 'load_mode', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v13: 유산소 지표 확장 — 경사(러닝머신)·단계(사이클·천국의 계단) + 루틴 유산소 목표(JSON). @plm SRS-030
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: 'set_logs',
          columns: [
            { name: 'incline_pct', type: 'number', isOptional: true },
            { name: 'level', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'routine_exercises',
          columns: [{ name: 'cardio_target', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'workout_exercises',
          columns: [{ name: 'cardio_target', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v14: 내 장비함 — 자주 쓰는 착용장비를 저장해 작성 선택기에서 재사용. @plm SRS-041
    // 새 테이블을 만들지 않는다: 이 파일에 createTable 선례가 전무하고 동일 migrations 가
    // 네이티브 SQLite·웹 LokiJS 두 어댑터에 배선되어 첫 사례가 부팅 실패 리스크를 진다.
    // user_profiles 의 @json 컬럼(available_equipment·machine_variant_labels) 선례를 그대로 따른다.
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'my_gear', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v15: 러닝머신 속도(km/h) 지표 — 러닝머신만 경사·속도 기록. @plm SRS-030
    {
      toVersion: 15,
      steps: [
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'speed_kmh', type: 'number', isOptional: true }],
        }),
      ],
    },
    // v16: 처방 어휘(세트 타입·RIR·반복범위) — 작성 주체는 사람(트레이너·프리셋, ADR-028).
    // 기존 행 null=비처방(기존 UI·동작 불변 — 옵트인 레이어). @plm SRS-043
    {
      toVersion: 16,
      steps: [
        addColumns({
          table: 'routine_exercises',
          columns: [{ name: 'prescription', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'workout_exercises',
          columns: [{ name: 'prescription', type: 'string', isOptional: true }],
        }),
        addColumns({
          table: 'set_logs',
          columns: [
            { name: 'set_type', type: 'string', isOptional: true },
            { name: 'target_rir', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    // v17: 주단위 스케줄·블록(요일→루틴 매핑 + N주+1주 디로딩) — user_profiles @json 선례. @plm SRS-044
    {
      toVersion: 17,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'weekly_schedule', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v18: 온보딩 경력·코칭 의향 분류 — 선택 수집(미응답 무차단), role은 자격 보증 아님. @plm SRS-045
    {
      toVersion: 18,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [
            { name: 'experience_level', type: 'string', isOptional: true },
            { name: 'trainer_intent', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    // v19: 캘린더 수동 '운동했어요' 표시일 — 앱 기록 없는 운동일 백필(표시 전용·다른 색 점). @plm SRS-011
    {
      toVersion: 19,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'manual_workout_days', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v20: 캘린더 날짜별 간단 메모 — 선택일 상세에서 작성(빈 값=삭제). user_profiles @json 선례. @plm SRS-011
    {
      toVersion: 20,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'calendar_notes', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v21: 앱 설정(주간 목표·주말 제외·알림음) — 기기 localStorage에만 있어 주소를 옮기자 사라졌다(2026-10-26).
    // 프로필에 실어 계정과 함께 동기한다. @plm SRS-006
    {
      toVersion: 21,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [{ name: 'app_prefs', type: 'string', isOptional: true }],
        }),
      ],
    },
    // v22: 종목 카탈로그 개편(ADR-033·034·037). 웹(LokiJS)만 남아 createTable 위험(v14 주석)이 사라졌다 —
    // 네이티브 앱(app/)은 2026-10-26 은퇴. 새 컬럼은 전부 optional: 기존 행은 null 이고 null 은 「기본」이다
    // (load_multiplier null = 1 · variant_load/attach null = 기본 칸). @plm SRS-055 SRS-058
    {
      toVersion: 22,
      steps: [
        addColumns({
          table: 'exercises',
          columns: [
            { name: 'family', type: 'string', isOptional: true, isIndexed: true },
            { name: 'aliases', type: 'string', isOptional: true },
            { name: 'similar', type: 'string', isOptional: true },
            { name: 'media_ref', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'workout_exercises',
          columns: [
            { name: 'variant_load', type: 'string', isOptional: true },
            { name: 'variant_attach', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'routine_exercises',
          columns: [
            { name: 'variant_load', type: 'string', isOptional: true },
            { name: 'variant_attach', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'set_logs',
          columns: [{ name: 'load_multiplier', type: 'number', isOptional: true }],
        }),
        createTable({
          name: 'exercise_user_prefs',
          columns: [
            { name: 'exercise_id', type: 'string', isIndexed: true },
            { name: 'display_name', type: 'string', isOptional: true },
            { name: 'plate_one_side', type: 'boolean', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    // v23: 기본 종목 숨기기를 사용자 선호로(/qa code M-4). 시드 종목 행은 사용자 동기에서 빠져(D10) 다른 기기로 가지 않았고,
    // 카탈로그를 다시 받으면 풀렸다. null = 숨기지 않음. @plm SRS-056
    {
      toVersion: 23,
      steps: [
        addColumns({
          table: 'exercise_user_prefs',
          columns: [{ name: 'hidden', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      // v24: 운동 블록 ↔ 루틴 줄 연결 — 운동 완료 때 루틴과 달라진 점(교체·세트 수…)을 짝짓는다. @plm SRS-059
      toVersion: 24,
      steps: [
        addColumns({
          table: 'workout_exercises',
          columns: [{ name: 'routine_exercise_id', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      // v25: 블록별 무게 단위(kg|lb) — 한 헬스장 안에 kg·lb 기구가 섞여 있다. null = kg(운영 기존 기록 전부 kg). @plm SRS-067
      toVersion: 25,
      steps: [
        addColumns({
          table: 'workout_exercises',
          columns: [{ name: 'weight_unit', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
