// @plm SRS-056  종목 검색 — 띄어쓰기·초성·별칭·영문을 한 색인으로(ADR-033). 피커와 종목 탭이 같은 함수를 쓴다.
//
// 색인은 목록이 바뀔 때 한 번 만든다(이름·별칭마다 정규화 키와 초성 키를 미리 계산) — 타자마다 다시 계산하지 않는다.
//
// 순위(낮을수록 위):
//   0 정확   — 정규화 키가 같다(「랫풀」 = 별칭 「랫풀」, 「랫 풀다운」 = 「랫풀다운」)
//   1 시작   — 키가 질의로 시작한다
//   2 부분   — 키 안에 질의가 있다
//   3 초성   — 질의가 초성만이면 초성 키로(「ㄹㅍ」 → 랫풀)
//   (「비슷한 운동」은 순위 밖 별도 구역 — 위 결과의 같은 family 다른 기구 + similar 참조)
// 같은 단계 안에서는 대표 한글명 > 별칭 > 영문 이름(QA L3: 영문 정확 일치가 다른 종목의 한글 대표명 정확 일치를 이기지 않게),
// 그다음 흔한 기구(바벨 > 덤벨 > 머신 > 케이블 …), 그다음 맞은 말이 짧은 쪽(질의를 더 많이 덮은 쪽), 그다음 가나다순.
import { normalizeNameKey } from './nameKey';

export interface SearchableExercise {
  id: string;
  nameKo: string;
  nameEn?: string | null;
  /** 한/영 별칭(시드·서버 카탈로그). 커스텀 종목은 빈 배열 */
  aliases?: string[] | null;
  family?: string | null;
  /** 같은 단계·같은 종류로 맞았을 때 흔한 기구가 앞선다(「bench press」 → 바벨 > 덤벨) */
  equipment?: string | null;
  /** 「비슷한 운동」 참조 — family 이름 또는 nameEn */
  similar?: string[] | null;
  isArchived?: boolean | null;
}

/** 맞은 말의 종류 — 결과 줄에 「대표 이름 · 맞은 별칭」을 그릴지 정한다. */
export type MatchedTermKind = 'name' | 'alias' | 'nameEn';
export type SearchTier = 0 | 1 | 2 | 3;

export interface SearchHit {
  id: string;
  tier: SearchTier;
  /** 맞은 말(원문). 대표 한글명이 맞았으면 nameKo 그대로 */
  matched: string;
  matchedKind: MatchedTermKind;
  /** 질의가 맞은 말 전체와 정규화 키로 같다(정확) — 「이 이름으로 부른다」로 볼 수 있는 경우 */
  exact: boolean;
}

export interface SearchResult {
  hits: SearchHit[];
  /** 비슷한 운동 — hits 에 없는 같은 family 다른 기구 + similar 참조 종목 id */
  similar: string[];
}

interface Term {
  text: string;
  key: string;
  cho: string;
  kind: MatchedTermKind;
}

interface Entry {
  ex: SearchableExercise;
  terms: Term[];
  equipRank: number;
}

export interface ExerciseSearchIndex {
  entries: Entry[];
  byId: Map<string, Entry>;
  byFamily: Map<string, string[]>;
  byNameEnKey: Map<string, string>;
}

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/** 한글 음절을 초성으로 바꾼다(그 외 글자는 그대로). 입력은 이미 정규화된 키여야 한다. */
export function chosungKey(key: string): string {
  let out = '';
  for (const ch of key) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

/** 질의가 초성(호환 자모 ㄱ~ㅎ)만으로 되어 있는가. */
export function isChosungOnly(key: string): boolean {
  return key.length > 0 && /^[ㄱ-ㅎ]+$/.test(key);
}

const KIND_RANK: Record<MatchedTermKind, number> = { name: 0, alias: 1, nameEn: 2 };
const EQUIP_ORDER = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'smith', 'ezbar', 'trapbar', 'kettlebell', 'band', 'other'];
const equipRankOf = (e: string | null | undefined): number => {
  const i = EQUIP_ORDER.indexOf(e ?? '');
  return i < 0 ? EQUIP_ORDER.length : i;
};

// NFKC 는 호환 자모 「ㄹ」(U+3139)를 첫소리 자모 「ᄅ」(U+1105)로 바꾼다 — 초성 질의를 알아보려면 되돌린다.
const toCompatCho = (key: string): string =>
  key.replace(/[\u1100-\u1112]/g, (c) => CHO[c.charCodeAt(0) - 0x1100]);

/** 목록 → 색인. 보관(archived) 종목은 넣지 않는다(QA M2 — 보관 행의 옛 이름은 대상 종목의 별칭으로 찾힌다). */
export function buildExerciseSearchIndex(list: SearchableExercise[]): ExerciseSearchIndex {
  const entries: Entry[] = [];
  const byId = new Map<string, Entry>();
  const byFamily = new Map<string, string[]>();
  const byNameEnKey = new Map<string, string>();
  for (const ex of list) {
    if (ex.isArchived) continue;
    const terms: Term[] = [];
    const seen = new Set<string>();
    const add = (text: string | null | undefined, kind: MatchedTermKind) => {
      const t = (text ?? '').trim();
      if (!t) return;
      const key = normalizeNameKey(t);
      if (!key || seen.has(key)) return;
      seen.add(key);
      terms.push({ text: t, key, cho: chosungKey(key), kind });
    };
    add(ex.nameKo, 'name');
    for (const a of ex.aliases ?? []) add(a, 'alias');
    add(ex.nameEn, 'nameEn');
    const entry = { ex, terms, equipRank: equipRankOf(ex.equipment) };
    entries.push(entry);
    byId.set(ex.id, entry);
    if (ex.family) {
      const arr = byFamily.get(ex.family) ?? [];
      arr.push(ex.id);
      byFamily.set(ex.family, arr);
    }
    if (ex.nameEn) byNameEnKey.set(normalizeNameKey(ex.nameEn), ex.id);
  }
  return { entries, byId, byFamily, byNameEnKey };
}

function bestTerm(entry: Entry, q: string, choOnly: boolean): { term: Term; tier: SearchTier; sub: number } | null {
  let best: { term: Term; tier: SearchTier; sub: number } | null = null;
  for (const term of entry.terms) {
    let tier: SearchTier | null = null;
    // 초성 질의는 단계 3 하나지만, 그 안에서도 정확 > 시작 > 부분(「ㄹㅍ」 → 별칭 「랫풀」이 「랙 풀」의 시작 일치보다 앞)
    let sub = 0;
    if (choOnly) {
      if (term.cho === q) tier = 3;
      else if (term.cho.startsWith(q)) [tier, sub] = [3, 1];
      else if (term.cho.includes(q)) [tier, sub] = [3, 2];
    } else if (term.key === q) tier = 0;
    else if (term.key.startsWith(q)) tier = 1;
    else if (term.key.includes(q)) tier = 2;
    if (tier == null) continue;
    if (!best || compareTerm(tier, sub, term, best.tier, best.sub, best.term) < 0) best = { term, tier, sub };
  }
  return best;
}

function compareTerm(ta: SearchTier, sa: number, a: Term, tb: SearchTier, sb: number, b: Term): number {
  if (ta !== tb) return ta - tb;
  if (sa !== sb) return sa - sb;
  const k = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (k !== 0) return k;
  return a.key.length - b.key.length;
}

/** 비슷한 운동을 모을 위쪽 결과 수 — 아래까지 다 모으면 구역이 결과보다 길어진다. */
const SIMILAR_SEED_HITS = 5;
const SIMILAR_LIMIT = 10;

const HANGUL_START = /^[\u3131-\u318E\uAC00-\uD7A3]/;

/** 이름 정렬 — 한글로 시작하는 이름이 영문·숫자 접두(「EZ바 …」)보다 먼저, 같은 무리 안은 가나다(F6). */
export function compareKoFirst(a: string, b: string): number {
  const ka = HANGUL_START.test(a) ? 0 : 1;
  const kb = HANGUL_START.test(b) ? 0 : 1;
  return ka - kb || a.localeCompare(b, 'ko');
}

/**
 * 질의 → 관련도 순 결과 + 비슷한 운동.
 * 빈 질의면 전 종목을 대표 이름 가나다순으로(검색 전 목록과 같다), 비슷한 운동은 없다.
 */
export function searchExercises(index: ExerciseSearchIndex, query: string): SearchResult {
  const q = toCompatCho(normalizeNameKey(query));
  if (!q) {
    // [원본] .sort((a, b) => a.ex.nameKo.localeCompare(b.ex.nameKo, 'ko')) — ICU 'ko' 는 라틴 글자를 한글보다 먼저 둬서
    //        종목 탭 첫 화면이 「EZ바 …」 로 시작했다(화면 정리 F6)
    // [개선] 한글로 시작하는 이름 먼저, 그다음 가나다(같은 무리 안은 그대로 localeCompare) @plm SRS-071
    const hits = [...index.entries]
      .sort((a, b) => compareKoFirst(a.ex.nameKo, b.ex.nameKo))
      .map((e) => ({ id: e.ex.id, tier: 0 as SearchTier, matched: e.ex.nameKo, matchedKind: 'name' as const, exact: false }));
    return { hits, similar: [] };
  }
  const choOnly = isChosungOnly(q);
  const scored: { entry: Entry; term: Term; tier: SearchTier; sub: number }[] = [];
  for (const entry of index.entries) {
    const b = bestTerm(entry, q, choOnly);
    if (b) scored.push({ entry, ...b });
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.sub - b.sub ||
      KIND_RANK[a.term.kind] - KIND_RANK[b.term.kind] ||
      a.entry.equipRank - b.entry.equipRank ||
      a.term.key.length - b.term.key.length ||
      a.entry.ex.nameKo.localeCompare(b.entry.ex.nameKo, 'ko'),
  );
  const hits: SearchHit[] = scored.map(({ entry, term, tier }) => ({
    id: entry.ex.id,
    tier,
    matched: term.text,
    matchedKind: term.kind,
    exact: tier === 0,
  }));
  return { hits, similar: similarFor(index, hits) };
}

/** 위쪽 결과의 같은 family 다른 기구 + similar 참조(family 이름이면 그 family 전부, 아니면 nameEn). */
export function similarFor(index: ExerciseSearchIndex, hits: SearchHit[]): string[] {
  const inHits = new Set(hits.map((h) => h.id));
  const out: string[] = [];
  const push = (id: string) => {
    if (inHits.has(id) || out.includes(id) || !index.byId.has(id)) return;
    out.push(id);
  };
  for (const h of hits.slice(0, SIMILAR_SEED_HITS)) {
    const ex = index.byId.get(h.id)?.ex;
    if (!ex) continue;
    for (const id of ex.family ? (index.byFamily.get(ex.family) ?? []) : []) push(id);
    for (const ref of ex.similar ?? []) {
      const fam = index.byFamily.get(ref);
      if (fam) for (const id of fam) push(id);
      else {
        const id = index.byNameEnKey.get(normalizeNameKey(ref));
        if (id) push(id);
      }
    }
    if (out.length >= SIMILAR_LIMIT) break;
  }
  return out.slice(0, SIMILAR_LIMIT);
}

/** 결과 줄의 보조 표기 — 대표 이름이 아닌 별칭·영문이 맞았으면 그 말. 같은 말이면 null. */
export function matchedLabel(hit: SearchHit, nameKo: string): string | null {
  if (hit.matchedKind === 'name') return null;
  return normalizeNameKey(hit.matched) === normalizeNameKey(nameKo) ? null : hit.matched;
}

/**
 * 피드 「내 루틴으로 가져오기」 — 공유된 종목을 내 카탈로그의 종목으로 찾는다(/qa code H-2).
 *
 * 순서: ① 공유에 실린 종목 id(시드 id 는 모든 사용자에게 같다)가 내 색인에 있으면 그것 ② 이름이 대표 이름·별칭·영문명과
 * **정확히** 같은 종목(정규화 키 — 띄어쓰기·대소문자 무시). 개편 전 옛 이름(「인클라인 프레스 (바벨)」)·사용자가 고른
 * 별칭(「로프 푸시다운」)도 대상 종목의 별칭이라 여기서 찾힌다. ③ 못 찾으면 null — 부르는 쪽이 커스텀 종목을 만든다.
 * 부분 일치는 쓰지 않는다: 「벤치」 한 마디로 엉뚱한 종목을 고르는 것보다 커스텀이 낫다.
 */
export function resolveSharedExercise(
  index: ExerciseSearchIndex,
  shared: { exerciseId?: string | null; name: string },
): { id: string; hit: SearchHit | null } | null {
  const id = shared.exerciseId?.trim();
  if (id && index.byId.has(id)) return { id, hit: null };
  const name = shared.name.trim();
  if (!name) return null;
  const exact = searchExercises(index, name).hits.find((h) => h.exact);
  return exact ? { id: exact.id, hit: exact } : null;
}
