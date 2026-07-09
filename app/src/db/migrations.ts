// 스키마 마이그레이션 (ADR-003). 컬럼 추가 시 여기 등록(어댑터에 배선됨 — native/web 공통).
import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
