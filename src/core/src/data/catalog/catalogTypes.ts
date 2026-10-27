// @plm SRS-055  종목 카탈로그 표의 모양 — 생성물(catalog.generated.ts)·무결성 검사·이관 계획이 함께 쓴다.
// 정본은 같은 디렉터리의 CSV 들이고, 이 타입은 생성기(scripts/gen-catalog.mjs)가 내는 JSON 의 계약이다.

/** 마스터 표의 상태 — merge·delete 는 보관(archived)되고 기록은 대상 종목으로 옮겨진다(ADR-033). */
export type CatalogStatus = 'keep' | 'rename' | 'merge' | 'delete' | 'new';

/** 이름 규칙(ADR-035) — 「기구 + 동작」(prefix) · 머신/기타 고유 동작(intrinsic) · 맨몸(bodyweight). */
export type NameRule = 'prefix' | 'intrinsic' | 'bodyweight';

/** 별칭이 함축하는 기록 칸 축(D7) — 「로프 푸시다운」 = 케이블 푸시다운 + attach=rope. arm=uni 는 세트 속성. */
export interface ImpliedAxes {
  brand?: string;
  attach?: string;
  grip?: string;
  arm?: string;
}

export interface CatalogRow {
  /** `seed-<nameEn 슬러그>` — 기존 값 불변 */
  id: string;
  nameEn: string;
  /** 대표 이름(보관 행은 옛 이름 유지) */
  nameKo: string;
  oldNameKo: string | null;
  status: CatalogStatus;
  nameRule: NameRule;
  /** EquipmentType + 'ezbar' | 'trapbar' */
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  kind: 'cardio' | null;
  loadMode: 'assisted' | 'bodyweight' | null;
  family: string;
  aliasesKo: string[];
  aliasesEn: string[];
  /** merge·delete 대상 id */
  mergeInto: string | null;
  impliedAxes: ImpliedAxes;
  /** 「비슷한 운동」 — family 이름 또는 nameEn */
  similar: string[];
  media: string | null;
  usageSets: number;
  isArchived: boolean;
}

/** 동작 그룹 메타 — 기록 칸 축의 허용 목록(ADR-034 · QA M4). 빈 목록 = 그 축 없음(UI 미노출·정규화 시 제거). */
export interface CatalogFamily {
  family: string;
  equipments: string[];
  attachments: string[];
  grips: string[];
  /** 머신 종목에 적재 방식(pin|plate) 축이 있는가 */
  load: boolean;
  /** 적재 축이 있을 때 흔한 적재 방식 — 빈 적재 칸의 기본(plate 면 한쪽 입력 기본 · 피드백 #63) @plm SRS-084 */
  loadDefault?: 'plate' | 'pin';
}

/** 같은 family 로 풀리지 않는 운영 칸의 명시 예외(QA H6). */
export interface MigrationOverride {
  sourceId: string;
  /** 블록의 variant_equipment 값 */
  variantEquipment: string;
  targetId: string;
  axes: ImpliedAxes;
  note: string;
}
