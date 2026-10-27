// @plm SRS-081  종목 맞추기 — 다른 앱의 종목 이름 → 우리 종목.
//
// 순서: ① import_aliases(사람이 한 번 맞춘 것 · 가리키는 종목이 색인에 없으면 무시 — D-9)
//       ② resolveSharedExercise(원래 이름 정확 일치 — 피드 가져오기와 같은 규칙)
//       ③ 괄호 장비 표기(「Bench Press (Barbell)」)를 기구 단서로: 「Barbell Bench Press」·「Bench Press Barbell」 정확 일치,
//          또는 괄호 앞 이름 정확 일치 + 기구 같음 → 자동
//       ④ searchExercises 후보 3(기구 단서가 같은 것 먼저) → 「확인 필요」
//       ⑤ 없으면 「못 맞춤」(화면이 「내 종목 만들기」 또는 직접 고르기)
// 검색은 기존 searchExercises 를 그대로 쓴다 — NFKC 자모 함정(초성 질의)을 다시 만들지 않는다.
//
// 기구 변형 칸(ADR-034): 기구 값(바벨·덤벨·케이블…)은 더 이상 칸이 아니다(기구가 다르면 다른 종목). 그래서 괄호의 기구는
// **종목 고르기 단서로만** 쓰고, 칸에는 케이블 부착물(「Cable - Rope」 등)처럼 확실한 것만 — 그 종목 family 의 허용 목록에
// 있을 때만 넣는다(normalizeVariantDimsV34). 허용 목록을 모르면 비운다.
import type { EquipmentType } from '../types';
import { resolveSharedExercise, searchExercises, type ExerciseSearchIndex } from '../exerciseSearch';
import { normalizeVariantDimsV34, type AttachKey, type VariantDims } from '../variants';
import type { ImportSourceKind } from './common';
import { importAliasId } from './hash';

export type MatchStatus = 'auto' | 'review' | 'none';
export type MatchVia = 'alias' | 'exact' | 'equipment_name' | 'base_equipment' | 'search' | null;

export interface ExerciseMatch {
  sourceName: string;
  status: MatchStatus;
  /** auto 면 고른 종목, review 면 첫 후보, none 이면 null */
  exerciseId: string | null;
  /** 확인 필요일 때 후보(최대 3) */
  candidates: string[];
  via: MatchVia;
  /** 괄호에서 읽은 기구 단서(커스텀 종목 만들 때 기구 기본값) */
  equipmentHint: EquipmentType | null;
  /** 변형 칸 — 확실한 것만(케이블 부착물 · 허용 목록 안). 없으면 null */
  variant: VariantDims | null;
}

export interface MatchContext {
  index: ExerciseSearchIndex;
  /** 별칭 id(`ia-…`) → 종목 id */
  aliases: ReadonlyMap<string, string>;
  /** 종목의 케이블 부착물 허용 목록(family 메타). 모르면 생략 — 부착물 칸을 비운다 */
  attachmentsFor?: (exerciseId: string) => readonly string[] | undefined;
}

export const MATCH_CANDIDATES = 3;

const EQUIP_WORDS: [RegExp, EquipmentType, string][] = [
  [/^smith( machine)?$/, 'smith', 'Smith Machine'],
  [/^barbell$/, 'barbell', 'Barbell'],
  [/^dumbbells?$/, 'dumbbell', 'Dumbbell'],
  [/^cable$/, 'cable', 'Cable'],
  [/^(machine|plate loaded|plate-loaded|lever)$/, 'machine', 'Machine'],
  [/^kettlebells?$/, 'kettlebell', 'Kettlebell'],
  [/^(band|bands|resistance band)$/, 'band', 'Band'],
  [/^(bodyweight|body weight|weighted|assisted)$/, 'bodyweight', 'Bodyweight'],
  [/^(ez bar|ez-bar|ezbar|ez curl bar)$/, 'ezbar', 'EZ Bar'],
  [/^(trap bar|hex bar)$/, 'trapbar', 'Trap Bar'],
];

const ATTACH_WORDS: [RegExp, AttachKey][] = [
  [/^rope$/, 'rope'],
  [/^straight( bar)?$/, 'straight'],
  [/^v[- ]?(bar|handle)$/, 'v'],
  [/^ez( bar)?$/, 'ez'],
  [/^(single|d)[- ]?handle$/, 'single'],
  [/^lat bar$/, 'lat_bar'],
];

export interface EquipmentHint {
  /** 괄호 앞 이름(괄호가 없으면 원래 이름) */
  base: string;
  equipment: EquipmentType | null;
  /** 단서의 표준 영어 낱말(「Barbell」) — 이름 조합 검색용 */
  equipmentWord: string | null;
  attach: AttachKey | null;
}

/** 「Triceps Pushdown (Cable - Rope)」 → base 「Triceps Pushdown」 · cable · rope. 끝 괄호 하나만 본다. */
export function parseEquipmentHint(name: string): EquipmentHint {
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(name.trim());
  if (!m) return { base: name.trim(), equipment: null, equipmentWord: null, attach: null };
  const base = m[1].trim();
  const parts = m[2]
    .split(/\s*[-–/,]\s*/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  let equipment: EquipmentType | null = null;
  let equipmentWord: string | null = null;
  let attach: AttachKey | null = null;
  for (const p of parts) {
    if (!equipment) {
      const hit = EQUIP_WORDS.find(([re]) => re.test(p));
      if (hit) {
        equipment = hit[1];
        equipmentWord = hit[2];
        continue;
      }
    }
    if (!attach) {
      const a = ATTACH_WORDS.find(([re]) => re.test(p));
      if (a) attach = a[1];
    }
  }
  // 「(Smith Machine)」 처럼 두 낱말이 하나의 기구인 경우 위 split 이 나누지 않는다 — 그대로 맞는다.
  // 부착물은 케이블 단서가 있을 때만 의미가 있다(「EZ Bar」 컬은 기구다).
  if (equipment !== 'cable') attach = null;
  return { base, equipment, equipmentWord, attach };
}

function equipmentOf(ctx: MatchContext, id: string): string | null {
  return ctx.index.byId.get(id)?.ex.equipment ?? null;
}

function isLive(ctx: MatchContext, id: string): boolean {
  const e = ctx.index.byId.get(id);
  return !!e && !e.ex.isArchived;
}

function variantFor(ctx: MatchContext, exerciseId: string, hint: EquipmentHint): VariantDims | null {
  if (!hint.attach || equipmentOf(ctx, exerciseId) !== 'cable') return null;
  const allowed = ctx.attachmentsFor?.(exerciseId);
  if (!allowed?.length) return null;
  const v = normalizeVariantDimsV34({ attach: hint.attach }, { baseEquipment: 'cable', attachments: allowed });
  return v.attach ? { attach: v.attach } : null;
}

function exactId(ctx: MatchContext, name: string): string | null {
  const r = resolveSharedExercise(ctx.index, { name });
  return r && isLive(ctx, r.id) ? r.id : null;
}

/** 이름 하나를 맞춘다. */
export function matchExerciseName(source: ImportSourceKind, name: string, ctx: MatchContext): ExerciseMatch {
  const hint = parseEquipmentHint(name);
  const done = (status: MatchStatus, id: string | null, via: MatchVia, candidates: string[] = []): ExerciseMatch => ({
    sourceName: name,
    status,
    exerciseId: id,
    candidates,
    via,
    equipmentHint: hint.equipment,
    variant: id && status === 'auto' ? variantFor(ctx, id, hint) : null,
  });

  // ① 별칭(가리키는 종목이 없어졌거나 보관됐으면 무시)
  const aliased = ctx.aliases.get(importAliasId(source, name));
  if (aliased && isLive(ctx, aliased)) return done('auto', aliased, 'alias');

  // ② 원래 이름 정확 일치
  const exact = exactId(ctx, name);
  if (exact) return done('auto', exact, 'exact');

  if (hint.equipment && hint.equipmentWord) {
    // ③-a 「Barbell Bench Press」 · 「Chest Press Machine」
    for (const n of [`${hint.equipmentWord} ${hint.base}`, `${hint.base} ${hint.equipmentWord}`]) {
      const id = exactId(ctx, n);
      if (id && equipmentOf(ctx, id) === hint.equipment) return done('auto', id, 'equipment_name');
    }
    // ③-b 괄호 앞 이름 정확 일치 + 기구 같음
    const baseExact = searchExercises(ctx.index, hint.base).hits.filter((h) => h.exact && isLive(ctx, h.id));
    const sameEquip = baseExact.find((h) => equipmentOf(ctx, h.id) === hint.equipment);
    if (sameEquip) return done('auto', sameEquip.id, 'base_equipment');
  }

  // ④ 후보 — 기구 단서가 같은 것을 앞으로(안정 정렬이라 같은 기구 안에서는 검색 순위 그대로)
  const hits = searchExercises(ctx.index, hint.base).hits.filter((h) => isLive(ctx, h.id));
  const ranked = hint.equipment
    ? [...hits].sort((a, b) => Number(equipmentOf(ctx, b.id) === hint.equipment) - Number(equipmentOf(ctx, a.id) === hint.equipment))
    : hits;
  const candidates = ranked.slice(0, MATCH_CANDIDATES).map((h) => h.id);
  if (candidates.length) return done('review', candidates[0], 'search', candidates);
  return done('none', null, null);
}

/** 여러 이름을 한 번에(같은 이름은 한 번만 계산). 결과는 입력 순서. */
export function matchExerciseNames(source: ImportSourceKind, names: readonly string[], ctx: MatchContext): ExerciseMatch[] {
  const memo = new Map<string, ExerciseMatch>();
  return names.map((n) => {
    let m = memo.get(n);
    if (!m) {
      m = matchExerciseName(source, n, ctx);
      memo.set(n, m);
    }
    return m;
  });
}
