// 스키마 마이그레이션 (ADR-003). Phase 0은 v1 초기 스키마뿐 — 추후 컬럼 추가 시 여기 등록.
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [],
});
