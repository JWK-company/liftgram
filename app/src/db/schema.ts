// WatermelonDB 스키마 (로컬-우선 영속화). @plm SRS-001 SRS-002 SRS-003 SRS-004 SRS-006, ADR-003
// 무게는 항상 kg 정규화 저장. WatermelonDB가 id/_status/_changed 컬럼은 자동 관리(동기 추적 — ADR-002).
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const SCHEMA_VERSION = 2;

export const mySchema = appSchema({
  version: SCHEMA_VERSION,
  tables: [
    // 사용자 프로필 (SRS-006). Phase 0: 로컬 단일 사용자 + 인증 스텁.
    tableSchema({
      name: 'user_profiles',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'display_name', type: 'string', isOptional: true },
        { name: 'auth_provider', type: 'string' }, // 'local' | 'email' | 'google' | 'apple'
        { name: 'preferred_language', type: 'string' }, // 'ko' | 'en'
        { name: 'weight_unit', type: 'string' }, // 'kg' | 'lb'
        { name: 'available_equipment', type: 'string', isOptional: true }, // JSON EquipmentType[] (가용 기구 — 빈/미설정=전체)
        { name: 'bar_weight_kg', type: 'number' },
        { name: 'last_sync_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 운동 카탈로그 (SRS-001)
    tableSchema({
      name: 'exercises',
      columns: [
        { name: 'name_ko', type: 'string', isIndexed: true },
        { name: 'name_en', type: 'string', isOptional: true },
        { name: 'primary_muscles', type: 'string' }, // JSON string[]
        { name: 'secondary_muscles', type: 'string' }, // JSON string[]
        { name: 'equipment', type: 'string', isIndexed: true }, // EquipmentType
        { name: 'category', type: 'string', isOptional: true },
        { name: 'is_custom', type: 'boolean' },
        { name: 'substitute_ids', type: 'string' }, // JSON string[] (대체운동 exercise id)
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 루틴(세션 템플릿) (SRS-002)
    tableSchema({
      name: 'routines',
      columns: [
        { name: 'user_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'folder', type: 'string', isOptional: true, isIndexed: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number' },
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 루틴 내 종목 + 목표(세트/반복범위/휴식/슈퍼셋) (SRS-002)
    tableSchema({
      name: 'routine_exercises',
      columns: [
        { name: 'routine_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string', isIndexed: true },
        { name: 'target_sets', type: 'number' },
        { name: 'target_reps_min', type: 'number', isOptional: true },
        { name: 'target_reps_max', type: 'number', isOptional: true },
        { name: 'target_weight_kg', type: 'number', isOptional: true },
        { name: 'rest_seconds', type: 'number' },
        { name: 'superset_group', type: 'string', isOptional: true }, // 같은 값끼리 슈퍼셋 묶음
        { name: 'sort_order', type: 'number' },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 운동 세션(라이브/완료) (SRS-004)
    tableSchema({
      name: 'workouts',
      columns: [
        { name: 'user_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'routine_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'name', type: 'string', isOptional: true },
        { name: 'state', type: 'string', isIndexed: true }, // WorkoutState
        { name: 'started_at', type: 'number', isIndexed: true },
        { name: 'paused_at', type: 'number', isOptional: true },
        { name: 'accumulated_pause_ms', type: 'number' },
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'total_volume_kg', type: 'number' }, // 완료 시 캐시
        { name: 'duration_seconds', type: 'number', isOptional: true },
        { name: 'pr_count', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 세션 내 종목 인스턴스 (SRS-004)
    tableSchema({
      name: 'workout_exercises',
      columns: [
        { name: 'workout_id', type: 'string', isIndexed: true },
        { name: 'exercise_id', type: 'string', isIndexed: true },
        { name: 'sort_order', type: 'number' },
        { name: 'note', type: 'string', isOptional: true },
        { name: 'prev_weight_kg', type: 'number', isOptional: true }, // 직전 세션 자동표시용 스냅샷
        { name: 'prev_reps', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 세트 로그 — append-only 원자 단위 (SRS-003, ADR-002)
    tableSchema({
      name: 'set_logs',
      columns: [
        { name: 'workout_exercise_id', type: 'string', isIndexed: true },
        { name: 'set_number', type: 'number' },
        { name: 'weight_kg', type: 'number' }, // 정규 kg 저장
        { name: 'reps', type: 'number' },
        { name: 'rpe', type: 'number', isOptional: true },
        { name: 'is_warmup', type: 'boolean' },
        { name: 'is_failed', type: 'boolean' },
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
