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
  ],
});
