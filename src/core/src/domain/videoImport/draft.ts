// 영상·글 → 루틴 초안(SPEC-054) — 언급·처방을 묶어 「날 → 줄」 초안을 만든다.
//
// 규칙(스펙 리뷰 REV-112 반영):
//   · 설명란·글은 줄 단위 — 언급 뒤 같은 줄 + 다음 언급 전까지 뒤 2줄의 처방을 붙인다.
//   · 스크립트는 흐름 — 시각 줄 글을 이어 붙여 줄을 넘는 이름도 찾고, 처방은 같은 줄 → 앞 언급(20초 안 · 휴식만은 120초) →
//     뒤 언급(20초 안 · 「4세트 할 건데요 … 레그 프레스」) 순으로 붙인다(P1).
//   · 스크립트 언급은 근거가 있어야 줄 — 처방이 붙었거나 · 60초 안에 2번 이상 · 챕터 제목과 같음. 나머지는 「언급만」(P3).
//     영상 끝 10% 안의 재언급(정리 구간)은 버린다.
//   · 모호한 말(strict)은 처방이나 기구 단서가 붙을 때만 줄(P2).
//   · 근거 합치기(P4): 처방 줄이 2개 이상인 글 > 설명란 순으로 뼈대 · 없으면 스크립트. 칸은 신뢰도가 높은 쪽(형식 패턴 2 > 말 1).
//     뼈대에 없는 종목은 「언급만」으로.
//   · 같은 날 같은 종목 두 줄 → 한 줄 + 메모 「이어서 N세트」(앞 줄이 처방을 몰랐으면 뒤 줄 값을 그대로).
//   · 세트·횟수를 못 읽으면 3×10 기본 + setsStated=false(화면이 「영상에 표기 없음 — 기본 3×10」).
//   · 메모는 parse 가 만든 정해진 낱말뿐 — 원문 조각을 넣지 않는다(P12).
import { findMentions, fuzzyMention, type Mention, type MentionIndex, normText } from './mention';
import {
  type Conf,
  dayHeaderOf,
  hasPrescription,
  type ImportLine,
  type ImportSource,
  looksLikeScript,
  type Prescription,
  readPrescription,
  splitImportLines,
  weekHeaderOf,
} from './parse';

export type DraftStatus = 'auto' | 'review' | 'none';

export interface DraftItem {
  /** 화면 key — 초안 안에서 유일 */
  key: string;
  status: DraftStatus;
  /** auto·review 면 고른(첫 후보) 종목, none 이면 null */
  exerciseId: string | null;
  /** review 후보(최대 4 — MAX_CANDIDATES) */
  candidates: string[];
  /** 못 찾음·확인 필요일 때 종목 선택 창 검색어 */
  query: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number | null;
  /** 영상·글에 세트·횟수가 적혀 있었나 — false 면 기본값 */
  setsStated: boolean;
  repsStated: boolean;
  setsConf: Conf;
  repsConf: Conf;
  noteKo: string | null;
  atSec: number | null;
  from: ImportSource;
}

export interface DraftDay {
  nameKo: string;
  items: DraftItem[];
}

export interface ImportDraft {
  days: DraftDay[];
  /** 영상에서 언급만 된 종목(처방 근거 없음) — 화면이 접어 두고, 누르면 줄로 더한다 */
  mentionedOnly: DraftItem[];
  /** 읽은 줄 수(근거별) */
  lines: Partial<Record<ImportSource, number>>;
  /** 「Week 2」 이후를 버렸나 */
  weeksDropped: boolean;
}

export const DEFAULT_SETS = 3;
export const DEFAULT_REPS = 10;
const TEXT_WINDOW_LINES = 2;
const SCRIPT_ATTACH_SEC = 20;
const SCRIPT_REST_ATTACH_SEC = 120;
const SCRIPT_REPEAT_SEC = 60;
const NOTE_MAX = 40;

let seq = 0;
function newKey() {
  seq += 1;
  return `d${seq}`;
}

function blankItem(from: ImportSource, atSec: number | null): DraftItem {
  return {
    key: newKey(),
    status: 'none',
    exerciseId: null,
    candidates: [],
    query: '',
    sets: DEFAULT_SETS,
    repsMin: DEFAULT_REPS,
    repsMax: DEFAULT_REPS,
    restSec: null,
    setsStated: false,
    repsStated: false,
    setsConf: 0,
    repsConf: 0,
    noteKo: null,
    atSec,
    from,
  };
}

function emptyP(): Prescription {
  return { setsConf: 0, repsConf: 0, notes: [] };
}

/** 처방 합치기 — 빈칸은 채우고, 이미 있는 칸은 신뢰도가 더 높을 때만 바꾼다 */
function mergeP(into: Prescription, add: Prescription) {
  if (add.sets != null && (into.sets == null || add.setsConf > into.setsConf)) {
    into.sets = add.sets;
    into.setsConf = add.setsConf;
  }
  if (add.repsMin != null && (into.repsMin == null || add.repsConf > into.repsConf)) {
    into.repsMin = add.repsMin;
    into.repsMax = add.repsMax;
    into.repsConf = add.repsConf;
  }
  if (into.restSec == null && add.restSec != null) into.restSec = add.restSec;
  if (into.rounds == null && add.rounds != null) into.rounds = add.rounds;
  for (const n of add.notes) if (!into.notes.includes(n)) into.notes.push(n);
}

function applyP(item: DraftItem, p: Prescription) {
  if (p.sets != null) {
    item.sets = p.sets;
    item.setsStated = true;
    item.setsConf = p.setsConf;
  }
  if (p.repsMin != null) {
    item.repsMin = p.repsMin;
    item.repsMax = p.repsMax ?? p.repsMin;
    item.repsStated = true;
    item.repsConf = p.repsConf;
  }
  if (p.restSec != null) item.restSec = p.restSec;
  if (p.notes.length) item.noteKo = joinNotes([item.noteKo, ...p.notes]);
}

function joinNotes(parts: (string | null | undefined)[]): string | null {
  const uniq = [...new Set(parts.filter((x): x is string => !!x))];
  return uniq.length ? uniq.join(' · ').slice(0, NOTE_MAX) : null;
}

function itemFor(index: MentionIndex, m: Mention, from: ImportSource, atSec: number | null): DraftItem {
  const item = blankItem(from, atSec);
  item.exerciseId = m.ids[0];
  item.candidates = m.ids;
  item.status = m.ids.length === 1 ? 'auto' : 'review';
  item.query = index.nameKo.get(m.ids[0]) ?? '';
  return item;
}

/** 이름 덩어리 — 줄에서 번호·숫자·단위·괄호를 뺀 글(못 찾음 줄의 검색어). 원문에서 온 글이지만 화면 상태에만 산다. */
function cleanQuery(text: string): string {
  return text
    .replace(/^[\s#*\-–•\d.)]+/, '')
    .replace(/\d+\s*[x×X*]\s*\d+(\s*[-~–]\s*\d+)?/g, ' ')
    .replace(/\d+(\.\d+)?\s*(sets?|reps?|세트|셋트|회|개|번|kg|lbs?|초|분|sec|min|s)\b/gi, ' ')
    .replace(/\d+(\.\d+)?\s*(세트|셋트|회|개|번|초|분)/g, ' ')
    .replace(/[(\[].*?[)\]]/g, ' ')
    .replace(/[:,\-–|@]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/** 처방 낱말(세트·횟수·휴식…)을 뺀 뒤에도 이름 같은 글자가 남나 — 한글 2자 또는 영문 3자 이상 */
const GENERIC_WORDS =
  /\b(sets?|reps?|rest|working|warm\s*-?\s*ups?|each|side|rounds?|x|by|of|for|to|failure|amrap|rpe|rir)\b|세트|셋트|회|개|번|휴식|쉬기|본|워밍업|웜업|각|한쪽|라운드|실패|까지/gi;
function nameLike(q: string): boolean {
  const rest = q.replace(GENERIC_WORDS, ' ');
  return /[가-힣]{2}/.test(rest) || /[a-z]{3}/i.test(rest);
}

// ── 설명란·글: 줄 단위 ─────────────────────────────────────────────────────
interface LineResult {
  days: DraftDay[];
  /** 처방이 붙은 줄 수 — 뼈대 고르기에 쓴다 */
  stated: number;
  weeksDropped: boolean;
  /** 서술 문장 속 언급(처방·시각 없음) — 「언급만」 */
  loose: DraftItem[];
}

export function draftFromLines(index: MentionIndex, lines: ImportLine[]): LineResult {
  const days: DraftDay[] = [{ nameKo: '', items: [] }];
  type Cur = { item: DraftItem; p: Prescription; lineIdx: number; strict: boolean; hinted: boolean; listy: boolean };
  // 클로저(close)가 바꾸므로 TS 가 좁히지 않게 상자에 담는다
  const box: { cur: Cur | null } = { cur: null };
  const loose: DraftItem[] = []; // 숫자 없는 서술 문장 속 언급 → 「언급만」
  let roundsForDay: number | null = null;
  let week: number | null = null;
  let weeksDropped = false;
  let stated = 0;
  const close = () => {
    if (!box.cur) return;
    const c = box.cur;
    box.cur = null;
    // 모호한 말은 처방이나 기구 단서가 붙어야 줄
    // 모호한 말은 세트나 횟수가 붙어야(휴식·시간만으로는 아님) — 또는 기구 단서
    if (c.strict && c.p.sets == null && c.p.repsMin == null && !c.hinted) return;
    applyP(c.item, c.p);
    // 처방도 시각도 없는 서술 문장(목록 줄이 아님) 속 언급은 줄로 만들지 않는다 — 「제가 좋아하는 건 벤치프레스」
    if (!hasPrescription(c.p) && c.item.atSec == null && !c.listy) {
      loose.push(c.item);
      return;
    }
    if (hasPrescription(c.p)) stated += 1;
    days[days.length - 1].items.push(c.item);
  };
  const closeDay = () => {
    close();
    if (roundsForDay != null) {
      for (const it of days[days.length - 1].items) {
        if (!it.setsStated) {
          it.sets = roundsForDay;
          it.setsStated = true;
          it.setsConf = 1;
        }
      }
    }
    roundsForDay = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const wk = weekHeaderOf(line.text);
    if (wk != null) {
      if (week != null && wk !== week) {
        weeksDropped = true;
        break; // 첫 주만
      }
      week = wk;
      continue;
    }
    const mentions = findMentions(index, line.text);
    if (!mentions.length) {
      const head = dayHeaderOf(line.text);
      if (head) {
        closeDay();
        const last = days[days.length - 1];
        if (last.items.length || last.nameKo) days.push({ nameKo: head, items: [] });
        else last.nameKo = head;
        continue;
      }
      const p = readPrescription(line.text);
      if (p.rounds != null) roundsForDay = p.rounds;
      // 이름처럼 보이는 덩어리가 있는 「세트×횟수」 줄은 앞 종목에 붙이지 않고 못 찾음 줄로(리뷰 T1 — 조용히 사라지지 않게)
      const ownRow = p.sets != null && p.repsMin != null && nameLike(cleanQuery(line.text));
      if (!ownRow && box.cur && i - box.cur.lineIdx <= TEXT_WINDOW_LINES) {
        mergeP(box.cur.p, p);
        continue;
      }
      // 종목 없이 세트×횟수가 있는 줄 — 못 찾음(검색어 = 이름 덩어리)
      if (p.sets != null && p.repsMin != null) {
        close();
        const item = blankItem(line.source, line.sec);
        item.query = cleanQuery(line.text);
        if (!item.query) continue;
        const fz = fuzzyMention(index, item.query);
        if (fz.length) {
          item.status = 'review';
          item.exerciseId = fz[0];
          item.candidates = fz;
        }
        applyP(item, p);
        stated += 1;
        days[days.length - 1].items.push(item);
      }
      continue;
    }
    // 언급이 있는 줄 — 언급마다 줄 · 처방은 그 언급 뒤 ~ 다음 언급 앞 글
    // 대소문자는 그대로(「SS」 슈퍼세트 · 리뷰 C6) — 위치는 normText 와 같다(소문자는 길이를 바꾸지 않음)
    const t = line.text.normalize('NFKC');
    mentions.forEach((m, k) => {
      const seg = t.slice(m.end, mentions[k + 1]?.start ?? t.length);
      let p = readPrescription(seg);
      // 「4x8 Bench Press」「1. 4세트 벤치프레스」 — 첫 언급 뒤에 처방이 없으면 앞 머리의 처방(리뷰 C4)
      if (k === 0 && !hasPrescription(p)) {
        const hp = readPrescription(t.slice(0, m.start).replace(/^[\s#*\-–•]*(?:\d{1,2}[.)]\s+)?/, ''));
        if (hasPrescription(hp)) p = hp;
      }
      if (p.rounds != null) roundsForDay = p.rounds;
      // 같은 종목이 바로 다시(챕터 줄 뒤 처방 줄 등은 아래 mergeSameExercise 가 맡는다)
      close();
      box.cur = {
        item: itemFor(index, m, line.source, line.sec),
        p,
        lineIdx: i,
        strict: m.strict,
        hinted: m.hinted,
        listy: isListLine(line.text, m.start),
      };
    });
  }
  closeDay();
  const kept = days.filter((d) => d.items.length);
  // 머리 아래 종목 0개인 날은 버리고(앞 날에 합칠 것이 없다), 이름 없는 첫 날이 있으면 그대로
  return { days: kept.map((d) => ({ ...d, items: mergeSameExercise(d.items) })), stated, weeksDropped, loose };
}

/** 목록 줄인가 — 짧고(60자 이하) 언급이 줄 머리(번호·기호 뒤 12자 안)에 있다 */
function isListLine(text: string, mentionStart: number): boolean {
  const t = normText(text);
  const lead = /^[\s#*\-–•\d.)]*/.exec(t)?.[0].length ?? 0;
  return t.length <= 60 && mentionStart - lead <= 12;
}

// ── 스크립트: 흐름 ─────────────────────────────────────────────────────────
interface StreamMention {
  m: Mention;
  sec: number | null;
  line: number;
}

export function draftFromScript(
  index: MentionIndex,
  lines: ImportLine[],
  chapterKeys: Set<string> = new Set(),
): { items: DraftItem[]; mentionedOnly: DraftItem[] } {
  // 흐름 = 줄 글을 「 」로 이은 것 · 글자 위치 → 줄 번호
  const parts: string[] = [];
  const lineStart: number[] = [];
  let pos = 0;
  for (const l of lines) {
    // 대소문자 그대로(대문자 약어 판정 · 리뷰 C6) — findMentions 가 안에서 정규화하고 위치는 같다
    const t = l.text.normalize('NFKC');
    lineStart.push(pos);
    parts.push(t);
    pos += t.length + 1;
  }
  const stream = parts.join(' ');
  const lineOf = (p: number) => {
    let lo = 0;
    let hi = lineStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStart[mid] <= p) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const ms: StreamMention[] = findMentions(index, stream).map((m) => {
    const line = lineOf(m.start);
    return { m, sec: lines[line]?.sec ?? null, line };
  });
  if (!ms.length) return { items: [], mentionedOnly: [] };

  // 줄마다 처방 → 붙일 언급 고르기
  const ps = new Map<number, Prescription>(); // 언급 번호 → 처방
  const linesWithMention = new Map<number, number[]>();
  ms.forEach((x, k) => linesWithMention.set(x.line, [...(linesWithMention.get(x.line) ?? []), k]));
  lines.forEach((l, li) => {
    const own = linesWithMention.get(li);
    const t = parts[li];
    if (own?.length) {
      // 같은 줄 — 언급 뒤 글은 그 언급에, 첫 언급 앞 글은 「앞 언급」 규칙으로
      own.forEach((k, j) => {
        const from = ms[k].m.end - lineStart[li];
        const to = j + 1 < own.length ? ms[own[j + 1]].m.start - lineStart[li] : t.length;
        const p = readPrescription(t.slice(Math.max(0, from), Math.max(0, to)));
        if (hasPrescription(p) || p.notes.length) mergeP(ps.get(k) ?? ps.set(k, emptyP()).get(k)!, p);
      });
      const head = t.slice(0, Math.max(0, ms[own[0]].m.start - lineStart[li]));
      attach(readPrescription(head), li, own[0]);
      return;
    }
    attach(readPrescription(t), li, null);
  });

  function attach(p: Prescription, li: number, nextOnLine: number | null) {
    if (!hasPrescription(p) && !p.notes.length) return;
    const sec = lines[li].sec;
    const restOnly = p.restSec != null && p.sets == null && p.repsMin == null;
    // 앞 언급(가장 가까운)
    let prev = -1;
    for (let k = ms.length - 1; k >= 0; k--) {
      if (ms[k].line < li || (ms[k].line === li && nextOnLine != null && k < nextOnLine)) {
        prev = k;
        break;
      }
    }
    const gap = (k: number) => (sec == null || ms[k].sec == null ? 0 : Math.abs(sec - (ms[k].sec ?? 0)));
    const near = (k: number, lim: number) => k >= 0 && gap(k) <= lim;
    // 뒤 언급 — 숫자가 이름보다 먼저 나온 말
    const next = nextOnLine ?? ms.findIndex((x) => x.line > li);
    const prevOk = near(prev, restOnly ? SCRIPT_REST_ATTACH_SEC : SCRIPT_ATTACH_SEC);
    const nextOk = next >= 0 && near(next, SCRIPT_ATTACH_SEC);
    // [원본] 앞 언급이 창 안이면 늘 앞 — 스펙은 「±20초 안 가장 가까운 언급」(리뷰 C9②)
    // [개선] 둘 다 창 안이면 가까운 쪽 · 같으면 앞
    const pick = prevOk && nextOk ? (gap(next) < gap(prev) ? next : prev) : prevOk ? prev : nextOk ? next : -1;
    if (pick >= 0) mergeP(ps.get(pick) ?? ps.set(pick, emptyP()).get(pick)!, p);
  }

  // 언급 → 줄(같은 종목이 이어지면 한 줄)
  const maxSec = Math.max(0, ...ms.map((x) => x.sec ?? 0));
  const outroFrom = maxSec * 0.9;
  const groups: { first: StreamMention; p: Prescription; count: number; lastSec: number | null; repeat: boolean }[] = [];
  ms.forEach((x, k) => {
    const p = ps.get(k) ?? emptyP();
    const g = groups[groups.length - 1];
    const sameAsLast = g && g.first.m.ids[0] === x.m.ids[0];
    if (sameAsLast) {
      mergeP(g.p, p);
      if (g.lastSec != null && x.sec != null && x.sec - g.lastSec <= SCRIPT_REPEAT_SEC) g.repeat = true;
      g.count += 1;
      g.lastSec = x.sec;
      return;
    }
    // 정리 구간 — 이미 나온 종목을 끝 10% 에서 다시 말하면 줄로 만들지 않는다 · 처방이 붙었으면 앞 줄에 합친다(리뷰 C2)
    const earlier = groups.find((y) => y.first.m.ids[0] === x.m.ids[0]);
    if (maxSec > 0 && x.sec != null && x.sec >= outroFrom && earlier) {
      if (hasPrescription(p)) mergeP(earlier.p, p);
      return;
    }
    groups.push({ first: x, p, count: 1, lastSec: x.sec, repeat: false });
  });

  // 60초 안 두 번 — 이어지지 않아도(「스쿼트 · 벤치 · 스쿼트」 · 리뷰 C9①)
  const secsById = new Map<string, number[]>();
  for (const x of ms) if (x.sec != null) secsById.set(x.m.ids[0], [...(secsById.get(x.m.ids[0]) ?? []), x.sec]);
  const repeated = (id: string) => {
    const xs = secsById.get(id) ?? [];
    return xs.some((a, i) => i > 0 && a - xs[i - 1] <= SCRIPT_REPEAT_SEC);
  };
  const items: DraftItem[] = [];
  const mentionedOnly: DraftItem[] = [];
  for (const g of groups) {
    const item = itemFor(index, g.first.m, 'script', g.first.sec);
    // [원본] … || (g.first.m.hinted && !g.first.m.strict) — 스펙 P3 에 없는 근거(리뷰 C9③)
    const proven = hasPrescription(g.p) || g.repeat || repeated(g.first.m.ids[0]) || chapterKeys.has(g.first.m.term.key);
    if (g.first.m.strict && !hasPrescription(g.p) && !g.first.m.hinted) continue; // 모호한 말 + 근거 없음 → 버림
    applyP(item, g.p);
    (proven ? items : mentionedOnly).push(item);
  }
  return { items: mergeSameExercise(items), mentionedOnly: dedupeById(mentionedOnly, items) };
}

function dedupeById(list: DraftItem[], taken: DraftItem[]): DraftItem[] {
  const seen = new Set(taken.map((i) => i.exerciseId));
  return list.filter((i) => {
    if (!i.exerciseId || seen.has(i.exerciseId)) return false;
    seen.add(i.exerciseId);
    return true;
  });
}

/** 같은 날 같은 종목 두 줄 → 한 줄(앞 줄) + 메모 「이어서 N세트」 · 앞 줄이 처방을 몰랐으면 뒤 줄 값을 그대로 */
export function mergeSameExercise(items: DraftItem[]): DraftItem[] {
  const out: DraftItem[] = [];
  const byId = new Map<string, DraftItem>();
  for (const it of items) {
    const prev = it.exerciseId ? byId.get(it.exerciseId) : undefined;
    if (!prev) {
      if (it.exerciseId) byId.set(it.exerciseId, it);
      out.push(it);
      continue;
    }
    if (!prev.setsStated && !prev.repsStated && (it.setsStated || it.repsStated)) {
      Object.assign(prev, {
        sets: it.sets,
        repsMin: it.repsMin,
        repsMax: it.repsMax,
        setsStated: it.setsStated,
        repsStated: it.repsStated,
        setsConf: it.setsConf,
        repsConf: it.repsConf,
        restSec: prev.restSec ?? it.restSec,
        noteKo: joinNotes([prev.noteKo, it.noteKo]),
        atSec: prev.atSec ?? it.atSec,
        status: prev.status === 'auto' || it.status === 'auto' ? 'auto' : prev.status,
      });
      continue;
    }
    if (it.setsStated) {
      const reps = it.repsStated ? `(${it.repsMin === it.repsMax ? it.repsMin : `${it.repsMin}~${it.repsMax}`}회)` : '';
      prev.noteKo = joinNotes([prev.noteKo, `이어서 ${it.sets}세트${reps}`]);
    }
  }
  return out;
}

/** 뼈대 줄에 다른 근거 줄을 채운다 — 칸마다 신뢰도가 높은 쪽 · 시각은 비었을 때만 */
function fillFrom(target: DraftItem, src: DraftItem) {
  if (src.setsStated && (!target.setsStated || src.setsConf > target.setsConf)) {
    target.sets = src.sets;
    target.setsStated = true;
    target.setsConf = src.setsConf;
  }
  if (src.repsStated && (!target.repsStated || src.repsConf > target.repsConf)) {
    target.repsMin = src.repsMin;
    target.repsMax = src.repsMax;
    target.repsStated = true;
    target.repsConf = src.repsConf;
  }
  if (target.restSec == null && src.restSec != null) target.restSec = src.restSec;
  if (target.atSec == null && src.atSec != null) target.atSec = src.atSec;
  target.noteKo = joinNotes([target.noteKo, src.noteKo]);
}

export interface ImportInput {
  /** 「스크립트 표시」 복사본 */
  script?: string | null;
  /** 붙여 넣은 글(스크립트 형식이면 스크립트로 읽는다 — looksLikeScript) */
  text?: string | null;
  /** 설명란(DescribeVideo) */
  description?: string | null;
}

/** 입력 → 초안. 원문은 돌려주지 않는다. */
export function buildImportDraft(index: MentionIndex, input: ImportInput): ImportDraft {
  const lines: Partial<Record<ImportSource, number>> = {};
  let script = input.script?.trim() ? input.script : null;
  let text = input.text?.trim() ? input.text : null;
  if (!script && text && looksLikeScript(text)) {
    script = text;
    text = null;
  }
  const desc = input.description?.trim() ? input.description : null;

  const textR = text ? draftFromLines(index, withCount(lines, 'text', splitImportLines(text, 'text'))) : null;
  const descLines = desc ? withCount(lines, 'desc', splitImportLines(desc, 'desc')) : [];
  const descR = desc ? draftFromLines(index, descLines) : null;
  // 챕터 제목(시각이 있는 설명란 줄)의 종목 말 — 스크립트 언급의 근거
  const chapterKeys = new Set(
    descLines.filter((l) => l.sec != null).flatMap((l) => findMentions(index, l.text).map((m) => m.term.key)),
  );
  const scriptR = script ? draftFromScript(index, withCount(lines, 'script', splitImportLines(script, 'script')), chapterKeys) : null;

  // 뼈대: 처방 줄 2개 이상인 글 > 설명란 > 스크립트 > (처방 없어도) 글 > 설명란
  const cands: { days: DraftDay[]; stated: number }[] = [];
  if (textR) cands.push(textR);
  if (descR) cands.push(descR);
  let base: DraftDay[] | null = cands.find((c) => c.stated >= 2)?.days ?? null;
  let baseIsScript = false;
  if (!base && scriptR?.items.length) {
    base = [{ nameKo: '', items: scriptR.items }];
    baseIsScript = true;
  }
  if (!base) base = cands.find((c) => c.days.some((d) => d.items.length))?.days ?? [];

  const mentionedOnly: DraftItem[] = [];
  const baseR = [textR, descR].find((c) => c?.days === base);
  if (baseR && baseR.stated >= 2) {
    // 처방 목록이 있는 글 — 처방도 시각도 없는 줄은 뼈대에서 빼 「언급만」으로(소개·잡담 줄)
    base = base.map((d) => ({
      ...d,
      items: d.items.filter((it) => {
        const keep = it.setsStated || it.repsStated || it.restSec != null || it.atSec != null;
        if (!keep) mentionedOnly.push(it);
        return keep;
      }),
    }));
  }
  for (const r of [textR, descR]) if (r) mentionedOnly.push(...r.loose);
  const all = base.flatMap((d) => d.items);
  const others: DraftItem[] = [
    ...(textR && textR.days !== base ? textR.days.flatMap((d) => d.items) : []),
    ...(descR && descR.days !== base ? descR.days.flatMap((d) => d.items) : []),
    ...(scriptR && !baseIsScript ? scriptR.items : []),
  ];
  for (const o of others) {
    if (!o.exerciseId) continue;
    const t = all.find((x) => x.exerciseId === o.exerciseId);
    if (t) fillFrom(t, o);
    else mentionedOnly.push(o);
  }
  mentionedOnly.push(...(scriptR?.mentionedOnly ?? []));
  const days = base
    .filter((d) => d.items.length)
    .map((d, i, arr) => ({ ...d, nameKo: d.nameKo || (arr.length > 1 ? `Day ${i + 1}` : '') }));
  return {
    days,
    mentionedOnly: dedupeById(mentionedOnly, all),
    lines,
    weeksDropped: !!(textR?.weeksDropped || descR?.weeksDropped),
  };
}

function withCount(lines: Partial<Record<ImportSource, number>>, src: ImportSource, ls: ImportLine[]): ImportLine[] {
  lines[src] = ls.length;
  return ls;
}

/** 저장 직전 — 못 찾음 줄 수 · 확인 필요 줄 수 */
export function countUnresolved(draft: ImportDraft): number {
  return draft.days.reduce((n, d) => n + d.items.filter((i) => !i.exerciseId).length, 0);
}
export function countReview(draft: ImportDraft): number {
  return draft.days.reduce((n, d) => n + d.items.filter((i) => i.status === 'review').length, 0);
}
