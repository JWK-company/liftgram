// 생성물이다 — 손으로 고치지 않는다. 정본: core/src/data/catalog/*.csv · 재생성: make catalog
// @plm SRS-057  이관 예외 표 — 같은 family 의 형제 종목으로 풀리지 않는 운영 칸(QA H6). 서버·기기 공용.
import type { MigrationOverride } from './catalogTypes';

export const MIGRATION_OVERRIDES: MigrationOverride[] = [
  {"sourceId":"seed-chest-supported-t-bar-row","variantEquipment":"machine","targetId":"seed-chest-supported-row","axes":{},"note":"catalog-review A20 — 같은 family 에 머신이 없어 다른 family(머신 체스트 서포티드 로우)로 옮긴다(운영 1블록)"},
];
