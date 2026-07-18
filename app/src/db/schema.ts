// WatermelonDB 스키마 (로컬-우선 영속화). @plm SRS-001 SRS-002 SRS-003 SRS-004 SRS-006, ADR-003
// 무게는 항상 kg 정규화 저장. WatermelonDB가 id/_status/_changed 컬럼은 자동 관리(동기 추적 — ADR-002).
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const SCHEMA_VERSION = 11;

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
        { name: 'machine_variant_labels', type: 'string', isOptional: true }, // v5: JSON string[3] 커스텀 기구 이름(전역 공용)
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
        { name: 'kind', type: 'string', isOptional: true }, // v10: 'strength'(기본·null포함) | 'cardio'(유산소). @plm SRS-030
        { name: 'is_custom', type: 'boolean' },
        { name: 'substitute_ids', type: 'string' }, // JSON string[] (대체운동 exercise id)
        { name: 'image_url', type: 'string', isOptional: true }, // v7: 종목 이미지(#8) — 업로드 URL. @plm SRS-001
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
        { name: 'machine_variant', type: 'string', isOptional: true, isIndexed: true }, // v5(레거시): 머신 브랜드 키. v6부터 variant_equipment로 흡수
        // v6: 종목 변형(기구·그립·팔) 일반화 — (종목×variant_key) 버킷. machine_variant 무손실 흡수. @plm SRS-028
        { name: 'variant_key', type: 'string', isOptional: true, isIndexed: true }, // canonical 버킷 키(파생, null=기본)
        { name: 'variant_equipment', type: 'string', isOptional: true }, // 기구/브랜드 키(null=카탈로그 기본)
        { name: 'variant_grip', type: 'string', isOptional: true }, // over/under/neutral/wide/close
        { name: 'variant_arm', type: 'string', isOptional: true }, // bi/uni(원암)
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
        // 루틴 목표 복사본(세션 시작 시 routine_exercises에서 복사 — 세트 프리레이·휴식 기본값). v3
        { name: 'target_sets', type: 'number', isOptional: true },
        { name: 'target_reps_min', type: 'number', isOptional: true },
        { name: 'target_reps_max', type: 'number', isOptional: true },
        { name: 'target_weight_kg', type: 'number', isOptional: true },
        { name: 'rest_seconds', type: 'number', isOptional: true },
        { name: 'machine_variant', type: 'string', isOptional: true, isIndexed: true }, // v5(레거시): 머신 브랜드 키. v6부터 variant_equipment로 흡수
        // v6: 종목 변형(기구·그립·팔) — (종목×variant_key) 버킷. @plm SRS-028
        { name: 'variant_key', type: 'string', isOptional: true, isIndexed: true }, // canonical 버킷 키(파생, null=기본)
        { name: 'variant_equipment', type: 'string', isOptional: true }, // 기구/브랜드 키(null=카탈로그 기본)
        { name: 'variant_grip', type: 'string', isOptional: true }, // over/under/neutral/wide/close
        { name: 'variant_arm', type: 'string', isOptional: true }, // bi/uni(원암)
        { name: 'superset_group', type: 'string', isOptional: true }, // v7: 세션 슈퍼셋 그룹(#20) — 루틴서 복사. @plm SRS-004
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    // 세트 로그 — 세션 시작 시 템플릿으로 프리레이(done=false), 수행 시 체크(done=true) (SRS-003, ADR-002)
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
        { name: 'is_drop', type: 'boolean', isOptional: true }, // v4: 드롭세트(W/일반/D/F 세트타입 중 하나)
        // v6: 로깅 정밀도 — 총중량/PR 정확도. @plm SRS-029
        { name: 'strict_reps', type: 'number', isOptional: true }, // 정자세 반복(null=전부 정자세=reps). 나머지(reps-strict_reps)=보조/치팅
        { name: 'load_adjust_kg', type: 'number', isOptional: true }, // 보정무게 signed. 어시스티드(−)/가중(+). null=0
        { name: 'arm', type: 'string', isOptional: true }, // v8: 세트별 편측 — 'uni'(원암/원레그), null=투암/투레그(기본). @plm SRS-028
        { name: 'grip', type: 'string', isOptional: true }, // v11: 세트별 그립 — over/under/neutral/wide/close, null=기본. 표시전용. @plm SRS-028
        { name: 'partial_reps', type: 'number', isOptional: true }, // v9: 부분반복(깔짝) — 볼륨/PR 제외 표시전용. @plm SRS-029
        // v10: 유산소(cardio) 지표 — 시간·거리. 근력 세트는 null. 볼륨/PR엔 미포함. @plm SRS-030
        { name: 'duration_sec', type: 'number', isOptional: true }, // 유산소 수행 시간(초)
        { name: 'distance_m', type: 'number', isOptional: true }, // 유산소 거리(미터·정규 저장, UI는 km)
        { name: 'done', type: 'boolean', isOptional: true }, // v3: 수행 완료 체크. null(레거시)=수행됨으로 취급
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
