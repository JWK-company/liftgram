// 영상·글 → 루틴 초안(SPEC-054) — 글 속 종목 언급 찾기.
//
// 검색 창(exerciseSearch)은 「질의 → 종목」이고, 여기는 「긴 글 → 그 안에 나온 종목들(위치 포함)」이다. 같은 이름·별칭을 쓴다.
//   · 한글 이름은 띄어쓰기를 지운 키에서 부분 일치(조사가 붙어도 — 「벤치프레스를」) · 뒤에 「랙」이 붙으면 제외(「스쿼트 랙」)
//   · 영문 이름은 낱말 묶음(어간을 맞춰 「curls」「pressing」「squatting」도) — 「row」가 「throw」 안에서 맞지 않게
//   · 모호한 말(일반어·자세 설명어와 겹치는 별칭 — 「몸풀기」「아놀드」「stretch」「bench」…)은 strict 로 표시 —
//     부르는 쪽(draft)이 처방이나 기구 단서가 붙었을 때만 줄로 쓴다(스펙 리뷰 P2). 길이로 거르지 않는다.
//   · 영문 약어(RDL·OHP·HSPU…)는 원문이 대문자 낱말일 때만 그냥 믿고, 소문자면 strict
//   · 겹치면 긴 말이 이긴다(「인클라인 덤벨 프레스」 > 「덤벨 프레스」)
//   · 같은 말을 가진 종목이 여럿이거나, 맞은 종목의 family 에 기구가 다른 형제가 있는데 기구 단서가 없으면 후보 여럿(→ 확인 필요 · P5)
import type { SearchableExercise } from '../exerciseSearch';
import { normalizeNameKey } from '../nameKey';

export interface MentionTerm {
  /** 정규화 키(한글) 또는 어간 낱말을 공백으로 이은 것(영문) */
  key: string;
  latin: boolean;
  strict: boolean;
  /** 영문 약어(대문자로 적혔을 때만 바로 믿는다) */
  abbr: boolean;
  ids: string[];
}

export interface MentionIndex {
  koByHead: Map<string, MentionTerm[]>; // 첫 두 글자 → 말들(긴 것 먼저)
  en: Map<string, MentionTerm[]>; // 첫 낱말 → 말들(낱말 많은 것 먼저)
  equipment: Map<string, string | null>;
  family: Map<string, string | null>;
  byFamily: Map<string, string[]>;
  nameKo: Map<string, string>;
  /** 오타 허용 비교용 — 한글 말(자모 키) */
  fuzzy: { jamo: string; term: MentionTerm }[];
}

/** 영문 낱말 어간 — curls→curl · presses→press · pressing→press · squatting→squat · flyes/flies→fly · raised→raise */
export function stemWord(w: string): string {
  let s = w.toLowerCase();
  // 「mornings」 — 복수 s 를 먼저 떼어 두 번 적용해도 같은 어간(리뷰 C10: 색인 morning→morn 과 어긋남)
  if (s.length > 6 && s.endsWith('ings')) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) {
    s = s.slice(0, -3);
    if (/([bdgmnprt])\1$/.test(s)) s = s.slice(0, -1); // squatting → squatt → squat
  } else if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('yes') && s.length > 4)
    s = s.slice(0, -2); // flyes → fly
  else if (/(ss|sh|ch|x)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 5 && s.endsWith('ed')) s = /[sgcv]ed$/.test(s) ? s.slice(0, -1) : s.slice(0, -2);
  else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1);
  return s;
}

export function latinWords(s: string): string[] {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stemWord);
}

/**
 * 모호한 말 — 일반어·자세 설명어·다른 뜻과 겹치는 별칭. 처방·기구 단서가 붙어야 종목으로 본다.
 * 카탈로그 별칭 가운데 짧은 한글 말·한 낱말 영문 말을 뽑아(2026-11-10 · SPEC-054 P2) 사람이 골랐다.
 */
export const AMBIGUOUS_KO = new Set(
  [
    '걷기', '걷기운동', '등산', '달리기', '러닝', '런닝', '몸풀기', '스트레칭', '하이퍼', '아놀드', '외회전', '내회전',
    '인터벌', '브릿지', '벤치', '데드', '클린', '클러스터', '히트', '인라인', '스키', '스키타기', '수영', '수영운동',
    '산책', '복싱', '권투', '요가', '요가운동', '자전거', '사이클', '싸이클', '매달리기', '철봉', '보드', '인상', '용상',
    '포고', '코쿤', '헤일로', '딥', '슈퍼맨', '배큠', '라이딩', '스케이트', '스케이팅', '클라이밍', '하이킹', '조깅',
    '스프린트', '스피닝', '에어로빅', '필라테스', '줄넘기', '스노보드', '볼더링', '물구나무', '와이퍼', '바이시클',
    '스캡션', '천계', '프스', '조개운동', '자벌레',
  ].map(normalizeNameKey),
);
export const AMBIGUOUS_EN = new Set(
  [
    'bench', 'clean', 'cluster', 'stretch', 'stretching', 'walk', 'walking', 'hike', 'hiking', 'running', 'swim',
    'swimming', 'skating', 'ski', 'skiing', 'halo', 'superman', 'vacuum', 'dip', 'squat', 'boxing', 'climbing',
    'cycling', 'spinning', 'sprint', 'yoga', 'pilates', 'skipping', 'snowboard', 'snowboarding', 'bouldering', 'erg',
    'rower', 'butterfly', 'crunch', 'jogging', 'handstand', 'deadlift', 'lunge', 'shrug', 'plank', 'snatch', 'thruster',
    'pullover', 'rollout', 'walkout', 'pistol',
  ].map((w) => latinWords(w).join(' ')),
);

const LATIN = /^[a-z0-9\s\-'&/().,+]+$/i;

// 기구 단서 — 조사가 붙어도(「덤벨로」「바벨을」) · 한글은 낱말 경계를 보지 않는다
const EQUIP_HINTS: [RegExp, string][] = [
  [/바벨|barbells?\b|\bbb\b/i, 'barbell'],
  [/덤벨|dumbbells?\b|\bdbs?\b/i, 'dumbbell'],
  [/케이블|cables?\b/i, 'cable'],
  [/스미스|smith\b/i, 'smith'],
  [/머신|machines?\b/i, 'machine'],
  [/케틀벨|kettlebells?\b|\bkb\b/i, 'kettlebell'],
  [/밴드|bands?\b/i, 'band'],
];

/** 글의 기구 단서 — 없으면 null */
export function equipmentHint(text: string): string | null {
  for (const [re, e] of EQUIP_HINTS) if (re.test(text)) return e;
  return null;
}

// ── 자모 ──
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
export function toJamo(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) {
      out += ch;
      continue;
    }
    out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + (c % 28 ? JONG[c % 28] : '');
  }
  return out;
}

export function buildMentionIndex(list: SearchableExercise[]): MentionIndex {
  const ko = new Map<string, MentionTerm>();
  const enByKey = new Map<string, MentionTerm>();
  const equipment = new Map<string, string | null>();
  const family = new Map<string, string | null>();
  const byFamily = new Map<string, string[]>();
  const nameKo = new Map<string, string>();
  for (const ex of list) {
    if (ex.isArchived) continue;
    equipment.set(ex.id, ex.equipment ?? null);
    family.set(ex.id, ex.family ?? null);
    if (ex.family) byFamily.set(ex.family, [...(byFamily.get(ex.family) ?? []), ex.id]);
    nameKo.set(ex.id, ex.nameKo);
    for (const text of [ex.nameKo, ex.nameEn, ...(ex.aliases ?? [])]) {
      const t = (text ?? '').trim();
      if (!t) continue;
      if (LATIN.test(t)) {
        const words = latinWords(t);
        if (!words.length) continue;
        const key = words.join(' ');
        // 한 낱말 · 5자 이하 · 모음이 거의 없는 말 = 약어(rdl·ohp·hspu·sldl·cgbp·t2b)
        const abbr = words.length === 1 && key.length <= 5 && (key.match(/[aeiou]/g) ?? []).length <= 1 && key !== 'dip';
        const term = enByKey.get(key) ?? { key, latin: true, strict: AMBIGUOUS_EN.has(key), abbr, ids: [] };
        if (!term.ids.includes(ex.id)) term.ids.push(ex.id);
        enByKey.set(key, term);
      } else {
        const key = normalizeNameKey(t);
        if (!key || key.length < 2) continue;
        const term = ko.get(key) ?? { key, latin: false, strict: AMBIGUOUS_KO.has(key), abbr: false, ids: [] };
        if (!term.ids.includes(ex.id)) term.ids.push(ex.id);
        ko.set(key, term);
      }
    }
  }
  const koByHead = new Map<string, MentionTerm[]>();
  for (const term of ko.values()) {
    const head = term.key.slice(0, 2);
    koByHead.set(head, [...(koByHead.get(head) ?? []), term]);
  }
  for (const arr of koByHead.values()) arr.sort((a, b) => b.key.length - a.key.length);
  const en = new Map<string, MentionTerm[]>();
  for (const term of enByKey.values()) {
    const head = term.key.split(' ')[0];
    en.set(head, [...(en.get(head) ?? []), term]);
  }
  for (const arr of en.values()) arr.sort((a, b) => b.key.split(' ').length - a.key.split(' ').length);
  const fuzzy = [...ko.values()].map((term) => ({ jamo: toJamo(term.key), term })).filter((x) => x.jamo.length >= 8);
  return { koByHead, en, equipment, family, byFamily, nameKo, fuzzy };
}

export interface Mention {
  /** normText(원문) 안 시작·끝 글자 위치 */
  start: number;
  end: number;
  term: MentionTerm;
  /** 기구 단서·family 형제를 적용한 뒤의 후보(1개면 확정) */
  ids: string[];
  /** strict 말(모호) 또는 소문자 약어 — 처방·기구 단서가 붙어야 줄이 된다 */
  strict: boolean;
  /** 언급 앞뒤에 기구 단서가 있었나 */
  hinted: boolean;
}

/** 후보 수 — 확인 화면의 후보 칩(그 밖은 「다른 종목…」) */
export const MAX_CANDIDATES = 4;
// 흔한 기구 순(검색 창 exerciseSearch 의 EQUIP_ORDER 와 같은 순서) — 형제 후보를 이 순서로 낸다
const EQUIP_ORDER = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'smith', 'ezbar', 'trapbar', 'kettlebell', 'band', 'other'];
const eqRank = (index: MentionIndex, id: string) => {
  const i = EQUIP_ORDER.indexOf(index.equipment.get(id) ?? 'other');
  return i < 0 ? EQUIP_ORDER.length : i;
};

function hasEquip(index: MentionIndex, id: string, hint: string): boolean {
  return (index.equipment.get(id) ?? '').toLowerCase().includes(hint);
}

/** 후보 정리 — 기구 단서로 좁히고, 하나로 맞았어도 family 에 기구가 다른 형제가 있는데 단서가 없으면 형제를 후보로 */
export function candidatesFor(index: MentionIndex, ids: string[], hint: string | null): string[] {
  let out = ids;
  if (out.length > 1 && hint) {
    const same = out.filter((id) => hasEquip(index, id, hint));
    if (same.length) out = same;
  }
  if (out.length !== 1) return out.slice(0, MAX_CANDIDATES);
  const fam = index.family.get(out[0]);
  const myEq = index.equipment.get(out[0]);
  const others = (fam ? (index.byFamily.get(fam) ?? []) : [])
    .filter((id) => id !== out[0] && index.equipment.get(id) !== myEq)
    .sort((a, b) => eqRank(index, a) - eqRank(index, b));
  if (!others.length) return out;
  if (hint) {
    if (hasEquip(index, out[0], hint)) return out;
    const same = others.filter((id) => hasEquip(index, id, hint));
    return same.length ? same.slice(0, MAX_CANDIDATES) : out;
  }
  return [out[0], ...others].slice(0, MAX_CANDIDATES);
}

const HANGUL = /[가-힣]/;
const KEY_DROP = /[\s\-_·.,/()[\]{}'"`~!?&+:;|]/;

/** findMentions 가 위치를 재는 글 — NFKC·소문자. 부르는 쪽도 이 함수로 바꾼 글에서 위치를 맞춘다. */
export function normText(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

/** 글에서 종목 언급들을 찾는다(앞에서부터 · 위치 포함). 기구 단서는 언급 자체 → 앞뒤 15자 순으로 찾는다. */
export function findMentions(index: MentionIndex, text0: string): Mention[] {
  const text = normText(text0);
  const out: Mention[] = [];
  // ── 한글: 키(공백·구두점을 뺀 글)에서 앞에서부터, 그 자리에서 가장 긴 말 ──
  const keyChars: string[] = [];
  const keyPos: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (KEY_DROP.test(text[i])) continue;
    keyChars.push(text[i]);
    keyPos.push(i);
  }
  const key = keyChars.join('');
  // [원본] 앞에서부터 그 자리의 가장 긴 말을 바로 확정 — 「딥 스쿼트」에서 딥스가 스쿼트를 가렸다(리뷰 C3)
  // [개선] 자리마다 맞는 가장 긴 말을 모은 뒤, 긴 것부터 겹치지 않게 고른다
  const found: { i: number; t: MentionTerm }[] = [];
  for (let i = 0; i < key.length - 1; i++) {
    // 한글로 시작하는 말만 여기서(영문 낱말은 아래 낱말 묶음으로) — 「ez바컬」처럼 영문으로 시작하는 섞인 말도 여기서
    const cands = index.koByHead.get(key.slice(i, i + 2));
    if (!cands) continue;
    for (const t of cands) {
      if (!key.startsWith(t.key, i) || key[i + t.key.length] === '랙') continue;
      // 영문 글자로 시작하는 섞인 말은 앞이 영문 낱말 중간이면 안 된다
      if (!HANGUL.test(key[i]) && i > 0 && /[a-z0-9]/.test(key[i - 1]) && keyPos[i] - keyPos[i - 1] === 1) continue;
      // 순수 영문 키(한글 없음)는 영문 쪽이 맡는다
      if (!HANGUL.test(t.key)) continue;
      const start = keyPos[i];
      const end = keyPos[i + t.key.length - 1] + 1;
      // 두 글자 말(레프·딥스·밀프…)은 띄어쓰기를 건너 잇지 않고, 낱말 중간이면 안 된다(조사는 허용)
      if (t.key.length <= 2 && (end - start !== t.key.length || HANGUL.test(text[start - 1] ?? '') || !wordEndOk(text, end))) continue;
      // 「벤치에서」「벤치 위에서」 — 위치 표현(스펙 P5)
      if (t.strict && /^\s*(?:에서|위에서|위에|위|에\s*앉)/.test(text.slice(end))) continue;
      found.push({ i, t });
      break;
    }
  }
  found.sort((a, b) => b.t.key.length - a.t.key.length || a.i - b.i);
  const taken: [number, number][] = [];
  for (const f of found) {
    const a = f.i;
    const b = f.i + f.t.key.length;
    if (taken.some(([x, y]) => a < y && x < b)) continue;
    taken.push([a, b]);
    out.push(mk(index, text, keyPos[a], keyPos[b - 1] + 1, f.t, f.t.strict));
  }
  // ── 영문: 낱말 배열에서 앞에서부터, 그 자리에서 낱말이 가장 많은 말 ──
  const words: { w: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[a-z0-9]+(?:['’][a-z]+)?/g)) {
    words.push({ w: stemWord(m[0].replace(/['’]/g, '')), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  const orig = text0.normalize('NFKC');
  for (let i = 0; i < words.length; ) {
    const cands = index.en.get(words[i].w);
    let hit: MentionTerm | null = null;
    if (cands) {
      for (const t of cands) {
        if (t.key.split(' ').every((w, j) => words[i + j]?.w === w)) {
          hit = t;
          break;
        }
      }
    }
    if (hit) {
      const n = hit.key.split(' ').length;
      const s = words[i].start;
      const e = words[i + n - 1].end;
      const upper = hit.abbr && /[A-Z]/.test(orig.slice(s, e)) && orig.slice(s, e) === orig.slice(s, e).toUpperCase();
      // 한글 쪽에서 같은 자리를 잡았으면(섞인 이름) 건너뛴다
      if (!out.some((m) => m.start < e && s < m.end)) out.push(mk(index, text, s, e, hit, hit.strict || (hit.abbr && !upper)));
      i += n;
    } else i += 1;
  }
  out.sort((a, b) => a.start - b.start);
  // 기구 단서는 다른 언급의 범위 밖에서만(리뷰 C7 — 「벤치에서 덤벨 컬」의 덤벨을 벤치가 빌려 가지 않게)
  return out.map((m) => rehint(index, text, m, out));
}

const JOSA_AFTER = /^(?:은|는|이|가|을|를|에|의|도|로|와|과|만|랑|하|부터|까지)/;
function wordEndOk(text: string, end: number): boolean {
  const rest = text.slice(end);
  return !HANGUL.test(rest[0] ?? '') || JOSA_AFTER.test(rest);
}

function rehint(index: MentionIndex, text: string, m: Mention, all: Mention[]): Mention {
  if (!m.hinted || equipmentHint(text.slice(m.start, m.end))) return m;
  const ws = Math.max(0, m.start - HINT_WINDOW);
  const we = Math.min(text.length, m.end + HINT_WINDOW);
  const w = text.slice(ws, we).split('');
  for (const o of all) {
    if (o === m || o.end <= ws || o.start >= we) continue;
    for (let k = Math.max(o.start, ws); k < Math.min(o.end, we); k++) w[k - ws] = ' ';
  }
  const near = equipmentHint(w.join(''));
  return { ...m, ids: candidatesFor(index, m.term.ids, near), hinted: near != null };
}

/** 기구 단서를 찾는 앞뒤 글자 수 — 넓으면 다음 종목의 기구를 끌어온다(「bench press … cable flyes」) */
const HINT_WINDOW = 15;

function mk(index: MentionIndex, text: string, start: number, end: number, term: MentionTerm, strict: boolean): Mention {
  const own = equipmentHint(text.slice(start, end));
  const near = own ?? equipmentHint(text.slice(Math.max(0, start - HINT_WINDOW), Math.min(text.length, end + HINT_WINDOW)));
  return { start, end, term, ids: candidatesFor(index, term.ids, near), strict, hinted: near != null };
}

/** 편집 거리 ≤ 1 */
export function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * 오타 허용(P10) — 「못 찾음」 줄의 이름 덩어리만. 자모로 풀어 거리 ≤ 1 · 자모 8개 이상.
 * 카탈로그 안에 맞은 말과 거리 ≤ 1 인 다른 종목의 말이 있으면(인클라인/디클라인) 믿지 않는다. 결과는 늘 「확인 필요」.
 */
export function fuzzyMention(index: MentionIndex, chunk: string): string[] {
  const jamo = toJamo(normalizeNameKey(chunk));
  if (jamo.length < 8) return [];
  const hits = index.fuzzy.filter((x) => Math.abs(x.jamo.length - jamo.length) <= 1 && within1(jamo, x.jamo));
  const ids = [...new Set(hits.flatMap((h) => h.term.ids))];
  if (ids.length !== 1) return [];
  const t = hits[0];
  const near = index.fuzzy.some(
    (x) =>
      !x.term.ids.includes(ids[0]) && Math.abs(x.jamo.length - t.jamo.length) <= 1 && within1(x.jamo, t.jamo),
  );
  return near ? [] : ids;
}
