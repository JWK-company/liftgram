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
  ],
});
