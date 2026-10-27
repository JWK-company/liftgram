// @plm SRS-057 SRS-058  종목의 카탈로그 메타 — 기록 칸 축의 허용 목록과 「기구 바꾸기」 후보(같은 동작 그룹의 다른 기구 종목).
//
// family 메타(허용 부착물·그립·적재 방식)는 번들 카탈로그 표에서 읽는다(서버도 같은 CSV 에서 나온다). 표는 크니
// 처음 필요할 때 한 번만 불러 둔다. 종목의 family 는 로컬 행(시드·카탈로그 동기가 채운다)에서 읽는다.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Exercise } from '../db/models';
import type { CatalogFamily } from './catalog/catalogTypes';
import type { VariantAxesAllowed } from '../domain/variants';

let families: Map<string, CatalogFamily> | null = null;
async function familyTable(): Promise<Map<string, CatalogFamily>> {
  if (families) return families;
  const { CATALOG_FAMILIES } = await import('./catalog/catalog.generated');
  families = new Map(CATALOG_FAMILIES.map((f) => [f.family, f]));
  return families;
}

export async function getFamilyMeta(family: string | null | undefined): Promise<CatalogFamily | null> {
  if (!family) return null;
  return (await familyTable()).get(family) ?? null;
}

/** 이 종목의 기록 칸 축 허용 목록(ADR-034) — 쓰기 정규화(normalizeVariantDimsV34)와 선택 시트가 같이 쓴다. */
export async function variantAxesFor(exerciseId: string): Promise<VariantAxesAllowed> {
  try {
    const ex = await database.get<Exercise>('exercises').find(exerciseId);
    const meta = await getFamilyMeta(ex.family);
    return {
      baseEquipment: ex.equipment ?? null,
      attachments: meta?.attachments ?? [],
      grips: meta?.grips ?? [],
      load: meta?.load ?? false,
    };
  } catch {
    return { baseEquipment: null, attachments: [], grips: [], load: false };
  }
}

/**
 * 플레이트 후보 종목의 흔한 적재 방식(2026-10-27 피드백 #63) — 기구 머신 + family 적재 축 + 하중 모드 external 이면
 * family 의 load_default(plate|pin), 아니면 null. 카탈로그 키 축은 바꾸지 않는다(빈 적재 칸의 기본일 뿐이다). @plm SRS-084
 */
export async function plateDefaultLoadMap(exerciseIds: string[]): Promise<Map<string, 'plate' | 'pin' | null>> {
  const [{ plateDefaultLoad }, { resolveLoadMode }] = await Promise.all([
    import('../domain/recordSlots'),
    import('../domain/volume'),
  ]);
  const out = new Map<string, 'plate' | 'pin' | null>();
  for (const id of [...new Set(exerciseIds)].filter(Boolean)) {
    try {
      const ex = await database.get<Exercise>('exercises').find(id);
      const meta = await getFamilyMeta(ex.family);
      const mode = resolveLoadMode(ex as unknown as Parameters<typeof resolveLoadMode>[0]);
      out.set(id, plateDefaultLoad(ex.equipment ?? null, meta?.load ?? false, mode, meta?.loadDefault));
    } catch {
      out.set(id, null);
    }
  }
  return out;
}

export interface SiblingExercise {
  id: string;
  equipment: string;
  nameKo: string;
}

/**
 * 「기구 바꾸기」 후보 — 같은 동작 그룹(family)의 다른 기구 종목(보관·커스텀 제외). 자기 자신은 빼지 않는다
 * (시트가 현재 기구를 켜진 칩으로 보여 준다). 기구 순서는 흔한 것부터.
 */
export async function familySiblings(exerciseId: string): Promise<SiblingExercise[]> {
  try {
    const ex = await database.get<Exercise>('exercises').find(exerciseId);
    if (!ex.family) return [];
    const rows = await database
      .get<Exercise>('exercises')
      .query(Q.where('family', ex.family), Q.where('is_archived', false), Q.where('is_custom', false))
      .fetch();
    const order = ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'ezbar', 'trapbar', 'kettlebell', 'band', 'bodyweight', 'other'];
    return rows
      .map((r) => ({ id: r.id, equipment: r.equipment as string, nameKo: r.nameKo }))
      .sort((a, b) => order.indexOf(a.equipment) - order.indexOf(b.equipment));
  } catch {
    return [];
  }
}
