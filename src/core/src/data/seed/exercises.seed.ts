// 기본 운동 카탈로그 시드 (SRS-001) — 카탈로그 개편 P2(ADR-033)부터 **마스터 표에서 파생**한다.
// 정본: core/src/data/catalog/catalog.master.csv → (make catalog) → catalog.generated.ts → 여기.
// seedRunner 가 매 부팅 top-up(없는 종목만)·계정 비울 때 전건 주입에 쓴다. 손으로 종목을 더하지 말고 CSV 에 더한다.
// 보관(병합·삭제) 종목도 싣는다 — 옛 기록이 정규화되기 전에도 이름이 비지 않게(보관 = 고를 수 없음). @plm SRS-001 SRS-055
import type { EquipmentType, ExerciseKind, LoadMode, MuscleGroup } from '../../domain';
import { CATALOG } from '../catalog/catalog.generated';

export interface SeedExercise {
  nameKo: string;
  nameEn: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  category?: string;
  kind?: ExerciseKind; // v10: 'cardio'=유산소(시간·거리 기록). 미지정=근력. @plm SRS-030
  loadMode?: LoadMode; // v12: 'assisted'(체중-무게)|'bodyweight'(체중+무게). 미지정=기구로 파생. @plm SRS-033
  // v22 (ADR-033·034) — 동작 그룹·별칭·비슷한 운동·그림 출처·보관
  family?: string | null;
  aliases?: string[];
  similar?: string[];
  mediaRef?: string | null;
  isArchived?: boolean;
}

export const SEED_EXERCISES: SeedExercise[] = CATALOG.map((r) => ({
  nameKo: r.nameKo,
  nameEn: r.nameEn,
  primaryMuscles: r.primaryMuscles as MuscleGroup[],
  secondaryMuscles: r.secondaryMuscles as MuscleGroup[],
  equipment: r.equipment as EquipmentType,
  kind: (r.kind ?? undefined) as ExerciseKind | undefined,
  loadMode: (r.loadMode ?? undefined) as LoadMode | undefined,
  family: r.family,
  aliases: [...r.aliasesKo, ...r.aliasesEn],
  similar: r.similar,
  mediaRef: r.media,
  isArchived: r.isArchived,
}));
