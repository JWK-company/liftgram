// 영상·글 → 루틴 초안(SPEC-054 · SRS-116 · ADR-063) — ① 글을 줄로 나누고 ② 글 조각에서 처방(세트·횟수·휴식·메모)을 읽는다.
//
// 라이브 LLM 없이 규칙만 쓴다. 입력 원문은 이 함수들의 인자로만 지나가고 어디에도 저장하지 않는다(부르는 쪽 책임 — ADR-063).
// 메모는 원문 조각이 아니라 정해진 낱말·수로 새로 만든다(스펙 리뷰 P12).
//
// 입력 세 갈래:
//   script — 유튜브 「스크립트 표시」 복사본. 「0:03」 줄 + 글 줄 쌍 · 길이 줄(「8초」「1 minute, 2 seconds」) · 「챕터 N:」 줄이 섞인다.
//            한 줄에 「0:03 글」로 붙어 오기도 한다.
//   desc   — 설명란. 「0:00 Intro」 같은 챕터 줄 + 「Bench Press 4x8」 같은 처방 줄.
//   text   — 사용자가 붙여 넣은 아무 글(블로그·메모·커뮤니티 글).
//
// 처방 패턴은 SPEC-054 「처방 패턴 표」와 같다 — 표가 곧 테스트 데이터다(src/core/src/domain/__tests__/videoImport.test.ts).

export type ImportSource = 'script' | 'text' | 'desc';

export interface ImportLine {
  /** 영상 속 시각(초) — 시각이 없는 줄은 null */
  sec: number | null;
  text: string;
  source: ImportSource;
}

/** 「1:02」「1:02:03」 → 초. 아니면 null */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] == null ? null : Number(m[3])];
  if (b >= 60 || (c != null && c >= 60)) return null;
  return c == null ? a * 60 + b : a * 3600 + b * 60 + c;
}

// 스크립트 패널의 길이 줄 — 「8초」「1분 1초」「2 minutes, 5 seconds」(보완 작업 INSTRUCTIONS 와 같은 규칙)
const DURATION_LINE = /^(\d+\s*(시간|분|초)\s*)+$|^(\d+\s*(hours?|minutes?|seconds?),?\s*)+$/i;
const CHAPTER_LINE = /^(챕터|chapter)\s*\d+\s*:/i;
const LEAD_CLOCK = /^\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?\s*[-–—|:]?\s*(.*)$/;
const LONE_CLOCK = /^\d{1,2}:\d{2}(?::\d{2})?$/;

/** 글 → 줄. 시각 줄 다음 글 줄은 그 시각을 갖는다. 빈 줄·길이 줄·「챕터 N:」 줄은 버린다. */
export function splitImportLines(raw: string, source: ImportSource): ImportLine[] {
  const out: ImportLine[] = [];
  let pending: number | null = null;
  for (const line0 of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = line0.replace(/ /g, ' ').trim();
    if (!line) continue;
    if (DURATION_LINE.test(line)) continue;
    if (CHAPTER_LINE.test(line)) continue;
    const m = LEAD_CLOCK.exec(line);
    const sec = m ? parseClock(m[1]) : null;
    if (m && sec != null) {
      const rest = m[2].trim();
      if (rest) {
        out.push({ sec, text: rest, source });
        pending = null;
      } else pending = sec;
      continue;
    }
    out.push({ sec: pending, text: line, source });
    pending = null;
  }
  return out;
}

/**
 * 붙여 넣은 글이 「스크립트 표시」 복사본인가 — 입력 칸이 하나라 자동으로 가른다(스펙 리뷰 U11).
 * 시각만 있는 줄이 3개 이상이고 글 줄의 25% 이상이면, 또는 시각으로 시작하는 줄이 8개 이상이고 간격 중앙값이 20초 이하면 스크립트.
 * (설명란 챕터 「0:00 Intro」는 간격이 길어 스크립트로 보지 않는다.)
 */
export function looksLikeScript(raw: string): boolean {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const lone = lines.filter((l) => LONE_CLOCK.test(l)).length;
  if (lone >= 3 && lone / lines.length >= 0.25) return true;
  const secs = lines
    .map((l) => LEAD_CLOCK.exec(l))
    .map((m) => (m ? parseClock(m[1]) : null))
    .filter((s): s is number => s != null);
  if (secs.length < 8) return false;
  const gaps = secs
    .slice(1)
    .map((s, i) => s - secs[i])
    .filter((g) => g >= 0)
    .sort((a, b) => a - b);
  return gaps.length > 0 && gaps[Math.floor(gaps.length / 2)] <= 20;
}

// ── 수 낱말 → 숫자 ─────────────────────────────────────────────────────────
// 단위(세트·회·개·번·분·초·sets·reps…) 앞에 올 때만 바꾼다 — 「세 번째 종목」「one more」 같은 일반 말은 건드리지 않게.
// 한자어 수(일·이·삼…)는 「이 세트」(this set) 같은 말과 겹쳐 쓰지 않는다.
const EN_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
};
// 긴 말 먼저(「열다섯」이 「열」보다 앞) · 「두세」「서너」「네다섯」은 큰 값(세트 범위는 큰 값 — 큐레이션 규칙)
const KO_NUM: [string, number][] = [
  ['열다섯', 15], ['열네', 14], ['열넷', 14], ['열세', 13], ['열셋', 13], ['열두', 12], ['열둘', 12], ['열한', 11],
  ['열하나', 11], ['대여섯', 6], ['네다섯', 5], ['서너', 4], ['두세', 3], ['스무', 20], ['스물', 20], ['서른', 30],
  ['다섯', 5], ['여섯', 6], ['일곱', 7], ['여덟', 8], ['아홉', 9], ['열', 10], ['하나', 1], ['한', 1], ['둘', 2], ['두', 2],
  ['셋', 3], ['세', 3], ['넷', 4], ['네', 4],
];
const EN_UNIT = '(?:sets?|reps?|repetitions?|rounds?|seconds?|secs?|minutes?|mins?)';
const KO_UNIT = '(?:세트|셋트|회|개|번|분|초|라운드)';
const EN_WORDS = Object.keys(EN_NUM).join('|');

export function wordsToDigits(s: string): string {
  let t = s
    .replace(/\ba\s+couple\s+(?:of\s+)?(?=sets?\b)/gi, '2 ')
    // 「half a dozen」을 먼저(뒤 규칙이 「a dozen」만 먹지 않게) · 끝에 공백이 없어도(리뷰 T6)
    .replace(/\bhalf\s+a\s+dozen\b(?:\s+reps?\b)?/gi, ' 6 reps ')
    .replace(/\ba\s+dozen\b(?:\s+reps?\b)?/gi, ' 12 reps ');
  t = t.replace(
    new RegExp(`\\b(${EN_WORDS})(?:[-\\s](one|two|three|four|five|six|seven|eight|nine))?\\s+(?=${EN_UNIT}\\b|to\\s|or\\s|-|by\\s)`, 'gi'),
    (_m, a: string, b?: string) => `${EN_NUM[a.toLowerCase()] + (b ? EN_NUM[b.toLowerCase()] : 0)} `,
  );
  // 「to twelve reps」「by ten」의 뒤쪽 수
  t = t.replace(
    new RegExp(`\\b(to|or|by|of)\\s+(${EN_WORDS})\\b`, 'gi'),
    (_m, w: string, a: string) => `${w} ${EN_NUM[a.toLowerCase()]}`,
  );
  // 「한 세트에 10개씩」「한 세트당」은 세트 수가 아니다(리뷰 C8) · 「한 번 더」도
  t = t.replace(/(^|[^가-힣])한\s*(세트|셋트)\s*(에|당|마다)/g, '$1$2$3').replace(/(^|[^가-힣])한\s*번\s*(더|만|씩은)/g, '$1 ');
  for (const [w, n] of KO_NUM) {
    // 앞이 한글 낱말 중간이면 건너뛴다(「테스트 세트」 금지)
    t = t.replace(new RegExp(`(^|[^가-힣])${w}\\s*(?=${KO_UNIT})`, 'g'), (_m, pre: string) => `${pre}${n}`);
  }
  // 「한 10개」「약 10회」 — 근삿값 「한」은 수가 아니다
  t = t.replace(/(^|[^가-힣])(?:한|약|대략)\s+(?=\d)/g, '$1');
  return t;
}

// ── 처방 읽기 ──────────────────────────────────────────────────────────────
/** 칸 신뢰도 — 2 = 형식 패턴(4x8 · 4 sets of 8 · 3세트 12회) · 1 = 그 밖(말 숫자·한 칸만) · 0 = 없음 */
export type Conf = 0 | 1 | 2;

export interface Prescription {
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  restSec?: number;
  /** 「3라운드」 — 같은 날 줄들의 빈 세트를 채운다 */
  rounds?: number;
  setsConf: Conf;
  repsConf: Conf;
  /** 실행 메모(정해진 낱말·수만) */
  notes: string[];
}

const MAX_SETS = 10;
const MAX_REPS = 50;
const okSets = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_SETS;
const okReps = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_REPS;

/** 처방이 아닌 숫자를 지운다 — 시각 · 무게 · 비율 · 연도 · 몇 번째 세트 · 할인 코드 */
function stripNoise(s: string, notes: string[]): string {
  let t = s
    // 「rest 1:30」 — 휴식 낱말 바로 뒤 분:초는 시각이 아니라 휴식(리뷰 T10) · 시각 지우기 전에 초로 바꾼다
    .replace(/(rest|휴식|쉬는\s*시간|쉬기)\s*[:=-]?\s*(\d{1,2}):([0-5]\d)\b/gi, (_m, w: string, mm: string, ss: string) => `${w} ${Number(mm) * 60 + Number(ss)}s `)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    // 무게 × 횟수 — 「100kg x 5」「75% x 5」 → 횟수만 남긴다
    .replace(/\d+(?:\.\d+)?\s*(?:kg|kgs|lbs?|pounds?|%)\s*[x×X*]\s*(\d+)/gi, ' $1 reps ')
    // 「10 each side」 — 단위 없는 횟수
    .replace(/\b(\d{1,2})\s+(?=(?:each|per)\s+(?:side|leg|arm)\b)/gi, '$1 reps ')
    .replace(/@\s*\d+(?:\.\d+)?\s*(?:kg|kgs|lbs?|%)?/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:kg|kgs|lbs?|pounds?|파운드|킬로|키로|k\b|%|퍼센트|percent|cm|mm|km|plates?|판)/gi, ' ')
    // 날짜 「11/10/25」「2026.11.10」 — 피라미드로 읽지 않게(리뷰 C11)
    .replace(/\b(?:19|20)\d{2}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, ' ')
    .replace(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/g, (m, a: string, b: string, c: string) => {
      const [x, y, z] = [Number(a), Number(b), Number(c)];
      // 월 ≤ 12 · 일 ≤ 31 · 단조(피라미드 20/15/10 · 12/10/8)가 아니면 날짜
      const mono = (x >= y && y >= z) || (x <= y && y <= z);
      return x >= 1 && x <= 12 && y >= 1 && y <= 31 && !mono ? ' ' : m;
    })
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\d+\s*%?\s*(?:off|할인)/gi, ' ');
  // 템포 3-1-1-0 · 3010(「tempo」 낱말과 함께) → 메모
  // [원본] 수 4개면 늘 템포 — 「5-5-5-5-5」「5-4-3-2」(세트 구성)까지 먹었다(리뷰 C11)
  // [개선] 4개 정확히(앞뒤로 더 이어지지 않음) + 0 이나 x 가 하나 이상(템포 표기의 특징)일 때만
  t = t.replace(/(?<![\d-])([0-5x])-([0-5x])-([0-5x])-([0-5x])(?![\d-])/gi, (m, a, b, c, d) => {
    if (![a, b, c, d].some((x) => x === '0' || x.toLowerCase() === 'x')) return m;
    pushNote(notes, `템포 ${a}-${b}-${c}-${d}`);
    return ' ';
  });
  t = t.replace(/(tempo|템포)\s*:?\s*([0-5x])([0-5x])([0-5x])([0-5x])\b/gi, (_m, _w, a, b, c, d) => {
    pushNote(notes, `템포 ${a}-${b}-${c}-${d}`);
    return ' ';
  });
  // 몇 번째 세트 — 첫/두/세/마지막 번째 세트 · 3세트째 · 3번째 · set 2 · first/last set
  t = t
    .replace(/(첫|두|세|네|다섯|마지막|\d+)\s*번째\s*(세트|셋트)?/g, ' ')
    .replace(/\d+\s*(세트|셋트)\s*째/g, ' ')
    .replace(/\bset\s*(?:#|no\.?)?\s*\d+\b/gi, ' ')
    .replace(/\b(first|second|third|fourth|last|final|next|another|top|back-?off)\s+set\b/gi, ' ');
  // 세는 소리 — 1씩 늘어나는 수 3개 이상(「1 2 3 4 5」)
  t = t.replace(/\b(\d{1,2})(?:[\s,]+(\d{1,2})){2,}\b/g, (m) => {
    const ns = m.split(/[\s,]+/).map(Number);
    return ns.every((n, i) => i === 0 || n === ns[i - 1] + 1) ? ' ' : m;
  });
  return t;
}

function pushNote(notes: string[], n: string) {
  if (!notes.includes(n)) notes.push(n);
}

/** 한 덩어리 글에서 처방을 읽는다. 처음 나온 값이 이긴다(같은 글 안 반복은 무시). */
export function readPrescription(text: string): Prescription {
  const p: Prescription = { setsConf: 0, repsConf: 0, notes: [] };
  // 형식 패턴은 원래 숫자로 적힌 글에서만 2점 — 말 숫자(「네 세트」)를 바꾼 뒤 읽은 것은 1점
  const formalText = stripNoise(text.normalize('NFKC'), p.notes);
  const spokenText = stripNoise(wordsToDigits(text.normalize('NFKC')), p.notes);
  const isFormal = (m: string) => formalText.includes(m);
  let s = spokenText;

  const set = (sets: number | null, a: number | null, b: number | null, conf: Conf) => {
    if (sets != null && okSets(sets) && p.sets == null) {
      p.sets = sets;
      p.setsConf = conf;
    }
    if (a != null && okReps(a) && (b == null || (okReps(b) && b >= a)) && p.repsMin == null) {
      p.repsMin = a;
      p.repsMax = b ?? a;
      p.repsConf = conf;
    }
  };

  // 0) 시간형 세트 — 3x60s · 3 x 30초 → 세트 + 「N초 유지」(휴식 아님)
  s = s.replace(/(\d+)\s*[x×X*]\s*(\d+)\s*(?:s|sec|secs|seconds?|초)\b/g, (m, a, b) => {
    if (!okSets(Number(a))) return m;
    set(Number(a), null, null, isFormal(m) ? 2 : 1);
    pushNote(p.notes, `${b}초 유지`);
    return ' ';
  });

  // 1) 워밍업 세트 — 「워밍업 2세트」「2 warm-up sets」 → 메모 · 작업 세트에서 뺀다
  s = s.replace(/(?:(\d+)\s*(?:warm\s*-?\s*up|워밍업|웜업)\s*(?:sets?|세트)?|(?:warm\s*-?\s*up|워밍업|웜업)\s*(\d+)\s*(?:sets?|세트))/gi, (m, a, b) => {
    const n = Number(a ?? b);
    if (n >= 1 && n <= 6) pushNote(p.notes, `워밍업 ${n}세트 따로`);
    return ' ';
  });
  if (/warm\s*-?\s*up\s*sets?|워밍업\s*세트|웜업\s*세트/i.test(s)) pushNote(p.notes, '워밍업 세트 따로');

  // 2) 피라미드 — 12-10-8 · 20/15/10 · (15,12,10,8) · 20·15·10회 (수 3~6개, 모두 3 이상)
  s = s.replace(/(\d{1,2})(?:\s*[-/,·]\s*(\d{1,2})){2,5}(?:\s*(?:reps?|회|개|번))?/gi, (m) => {
    const ns = (m.match(/\d{1,2}/g) ?? []).map(Number);
    if (ns.length < 3 || ns.some((n) => n < 3 || n > MAX_REPS)) return m;
    set(ns.length, Math.min(...ns), Math.max(...ns), isFormal(m) ? 2 : 1);
    if (new Set(ns).size > 1) pushNote(p.notes, `피라미드 ${ns.join('·')}`);
    return ' ';
  });

  // 3) 세트 범위 — 3-4 sets · 3~4세트 → 큰 값 + 메모
  s = s.replace(/(\d+)\s*(?:-|~|–|to|or|에서)\s*(\d+)\s*(?:sets?\b|세트|셋트)/gi, (m, a, b) => {
    const [x, y] = [Number(a), Number(b)];
    if (!okSets(x) || !okSets(y) || y <= x) return m;
    set(y, null, null, isFormal(m) ? 2 : 1);
    pushNote(p.notes, `${x}~${y}세트`);
    return ' ';
  });

  // 4) N×M — 4x8-10 · 4 × 8~10 · 3 by 10 (N>10 이면 무게×횟수로 다시 읽는다 — 「140x5」)
  s = s.replace(/(\d+)\s*(?:[x×X*]|\bby\b)\s*(\d+)(?:\s*(?:-|~|–|to)\s*(\d+))?/g, (m, a, b, c) => {
    const [n, r, r2] = [Number(a), Number(b), c ? Number(c) : null];
    const conf: Conf = isFormal(m) ? 2 : 1;
    if (okSets(n)) set(n, r, r2, conf);
    else set(null, r, r2, conf); // 무게×횟수
    return ' ';
  });
  // 「225 for 5」「60에 10개」 — 무게 + 횟수
  s = s.replace(/\b(\d{2,3})\s*(?:for|에)\s*(\d{1,2})(?=\s*(?:reps?|회|개|번)?\b)/gi, (m, _w, r) => {
    set(null, Number(r), null, 1);
    return ' ';
  });

  // 5) 4 sets of 8-10 (reps) · 3 sets x 12 reps · 3 sets 12 reps
  s = s.replace(
    /(\d+)\s*sets?\s*(?:of|x|×|,|with)?\s*(\d+)(?:\s*(?:-|~|–|to|or)\s*(\d+))?(?:\s*(?:reps?|repetitions?))?/gi,
    (m, a, b, c) => {
      set(Number(a), Number(b), c ? Number(c) : null, isFormal(m) ? 2 : 1);
      return ' ';
    },
  );
  // 6) 3세트 12회 · 3세트 8~12개 · 12회 3세트
  s = s.replace(
    /(\d+)\s*(?:세트|셋트)\s*(?:씩|를|에|,|각)?\s*(\d+)(?:\s*(?:-|~|–|에서|부터)\s*(\d+))?\s*(?:회|개|번|렙)(?:까지|씩)?/g,
    (m, a, b, c) => {
      set(Number(a), Number(b), c ? Number(c) : null, isFormal(m) ? 2 : 1);
      return ' ';
    },
  );
  s = s.replace(
    /(\d+)(?:\s*(?:-|~|–|에서|부터)\s*(\d+))?\s*(?:회|개|번|렙)(?:까지|씩)?\s*(?:,|를|으로|로)?\s*(\d+)\s*(?:세트|셋트)/g,
    (m, b, c, a) => {
      set(Number(a), Number(b), c ? Number(c) : null, isFormal(m) ? 2 : 1);
      return ' ';
    },
  );

  // 휴식 — 휴식 낱말이 앞뒤 25자 안에 있을 때만(「30초 버티기」는 휴식이 아니다)
  // [원본] 창 안 첫 시간 + s.replace(첫 등장) — 「30초 버티고 60초 휴식」에서 30을 휴식으로 읽었다(리뷰 C5)
  // [개선] 창 안 후보 중 휴식 낱말에 가장 가까운 것 · 지우기는 그 자리만 · 「rest-pause」「interest」 제외
  const restRe = /\brest\b(?!\s*-?\s*pause)|휴식|쉬고|쉬어|쉬는|쉽니다|쉴|쉬세요|break between|between sets/gi;
  const timeRe = /(\d+)\s*(?:분|minutes?|mins?)(?:\s*(\d+)\s*(?:초|seconds?|secs?|s\b))?|(\d+)\s*(?:초|seconds?|secs?|s\b)/gi;
  let best: { at: number; len: number; sec: number; d: number } | null = null;
  for (const rm of s.matchAll(restRe)) {
    const i = rm.index ?? 0;
    const lo = Math.max(0, i - 25);
    const win = s.slice(lo, i + rm[0].length + 25);
    for (const mm of win.matchAll(timeRe)) {
      const sec = mm[1] != null ? Number(mm[1]) * 60 + (mm[2] ? Number(mm[2]) : 0) : Number(mm[3]);
      if (sec < 10 || sec > 600) continue;
      const at = lo + (mm.index ?? 0);
      const d = at >= i ? at - (i + rm[0].length) : i - (at + mm[0].length);
      if (!best || d < best.d) best = { at, len: mm[0].length, sec, d };
    }
    if (best) break;
  }
  if (best) {
    p.restSec = best.sec;
    s = `${s.slice(0, best.at)} ${s.slice(best.at + best.len)}`;
  }

  // 라운드 — 「3 rounds」「3라운드」
  const rounds = /(\d+)\s*(?:rounds?\b|라운드)/i.exec(s);
  if (rounds && okSets(Number(rounds[1]))) {
    p.rounds = Number(rounds[1]);
    s = s.replace(rounds[0], ' ');
  }

  // 세트만 · 횟수만
  if (p.sets == null) {
    const m = /(\d+)\s*(?:sets?\b|세트|셋트)/i.exec(s);
    if (m) set(Number(m[1]), null, null, 1);
  }
  if (p.repsMin == null) {
    // 「번」은 「씩·반복」이 붙거나 세트를 이미 읽었을 때만 횟수(「일주일에 두 번」「3번 종목」 — 리뷰 C8)
    const unit = p.sets != null ? '회|개|번|렙' : '회|개|렙|번(?=\\s*(?:씩|반복))';
    const m = new RegExp(`(\\d+)(?:\\s*(?:-|~|–|to|or|에서|부터)\\s*(\\d+))?\\s*(?:reps?\\b|repetitions?\\b|${unit})`, 'i').exec(s);
    if (m) set(null, Number(m[1]), m[2] ? Number(m[2]) : null, 1);
  }

  // 시간 유지 — 휴식이 아닌 초·분(「30초 플랭크」「1분 버티기」「hold 30 seconds」)
  if (p.repsMin == null) {
    const hold = /(\d+)\s*(초|seconds?|secs?|s\b)|(\d+)\s*(분|minutes?)\s*(?:버티|유지|hold|홀드)/i.exec(s);
    if (hold) {
      const sec = hold[1] ? Number(hold[1]) : Number(hold[3]) * 60;
      if (sec >= 5 && sec <= 300) pushNote(p.notes, sec % 60 === 0 && sec >= 60 ? `${sec / 60}분 유지` : `${sec}초 유지`);
    }
  }

  // 메모(정해진 낱말만)
  const note = (re: RegExp, n: string) => re.test(spokenText) && pushNote(p.notes, n);
  note(/(to|until|close to)\s+failure|실패\s*(지점|까지|직전)|한계\s*까지|\bamrap\b/i, '실패 지점까지');
  note(/drop\s*-?\s*sets?|드롭\s*세트/i, '드롭세트');
  note(/super\s*-?\s*sets?|슈퍼\s*세트|\bSS\b/, '슈퍼세트');
  note(/each\s+(side|leg|arm)|per\s+(side|leg|arm)|한쪽|한\s*쪽씩|양쪽\s*각각/i, '한쪽씩');
  const rpe = /RPE\s*(\d+(?:\.5)?)/i.exec(spokenText);
  if (rpe && Number(rpe[1]) <= 10) pushNote(p.notes, `RPE ${rpe[1]}`);
  const rir = /(\d)\s*RIR\b|RIR\s*(\d)/i.exec(spokenText);
  if (rir) pushNote(p.notes, `RIR ${rir[1] ?? rir[2]}`);
  return p;
}

/** 처방에서 하나라도 읽었나 */
export function hasPrescription(p: Prescription): boolean {
  return p.sets != null || p.repsMin != null || p.restSec != null;
}

const WEEKDAY = /^(월|화|수|목|금|토|일)요일$|^(mon|tues|wednes|thurs|fri|satur|sun)day$/i;
const PART = '(상체|하체|가슴|등|어깨|팔|이두|삼두|복근|코어|전신|밀기|당기기|chest|back|shoulders?|arms?|legs?|push|pull|upper|lower|full\\s*body)';

/**
 * 줄이 날 머리인가(P9) — 줄 전체가 머리말일 때만(24자 이하). 「Week N」은 { week: N }.
 * 스크립트는 부르는 쪽이 「Day N · N일차」만 쓴다(scriptOnly).
 */
export function dayHeaderOf(text: string, scriptOnly = false): string | null {
  const t = text.replace(/^[#*\-–•=\s]+|[:\-–=\s]+$/g, '').trim();
  if (!t || t.length > 24) return null;
  if (/^(day|workout)\s*\d+$/i.test(t) || /^\d+\s*(일차|일째)$/.test(t)) return t;
  if (scriptOnly) return null;
  if (/^(day|workout)\s*\d+\s*[:\-–(]\s*\S.*$/i.test(t) && !/\bof\b|\bmy\b/i.test(t)) return t; // 「Day 1 – Push」 (「Day 1 of my bulk」 제외)
  if (/^(첫|둘|셋|넷|다섯)째\s*날$/.test(t) || WEEKDAY.test(t)) return t;
  if (new RegExp(`^${PART}(\\s*[·/&,+]\\s*${PART})*\\s*(day|workout|날|데이|루틴|운동)$`, 'i').test(t)) return t;
  return null;
}

/** 「Week 2」「2주차」 머리 — 첫 주만 쓰려고 */
export function weekHeaderOf(text: string): number | null {
  const t = text.replace(/^[#*\-–•=\s]+|[:\-–=\s]+$/g, '').trim();
  const m = /^week\s*(\d+)\b|^(\d+)\s*주\s*차/i.exec(t);
  return m && t.length <= 30 ? Number(m[1] ?? m[2]) : null;
}
