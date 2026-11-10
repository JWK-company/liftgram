// 영상·글 → 루틴 초안(SPEC-054) — 유튜브 링크 → videoId.
// watch?v= · youtu.be/ · shorts/ · live/ · embed/ · m.·music.·www. · 추적 파라미터(si·list·pp·feature)는 버리고 시작 시각(t)만 읽는다.

const ID = '([A-Za-z0-9_-]{11})';
const PATTERNS = [
  new RegExp(`(?:https?://)?(?:www\\.|m\\.|music\\.)?youtube\\.com/watch\\?(?:[^\\s#]*?&)?v=${ID}`, 'i'),
  new RegExp(`(?:https?://)?(?:www\\.)?youtu\\.be/${ID}`, 'i'),
  new RegExp(`(?:https?://)?(?:www\\.|m\\.)?youtube\\.com/(?:shorts|live|embed|v)/${ID}`, 'i'),
  new RegExp(`(?:https?://)?(?:www\\.)?youtube-nocookie\\.com/embed/${ID}`, 'i'),
];

export interface YoutubeLink {
  videoId: string;
  /** 링크에 붙은 시작 시각(초) — t=90 · t=1m30s */
  startSec: number | null;
  /** 원문에서 링크가 차지한 부분(지우려고) */
  match: string;
}

function parseT(v: string | null): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** 글에서 첫 유튜브 링크를 찾는다 */
export function findYoutubeLink(text: string): YoutubeLink | null {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    // 링크 전체(공백 전까지)를 match 로 — 뒤 파라미터까지 지우게
    const startIdx = m.index;
    const tail = /^[^\s]*/.exec(text.slice(startIdx))?.[0] ?? m[0];
    const t = /[?&#]t=([0-9hms]+)/.exec(tail)?.[1] ?? null;
    return { videoId: m[1], startSec: parseT(t), match: tail };
  }
  return null;
}

/** 입력 칸 → { 링크, 나머지 글 } — 링크를 지운 글이 비면 null */
export function splitLinkAndText(input: string): { link: YoutubeLink | null; text: string | null } {
  const link = findYoutubeLink(input);
  const rest = (link ? input.replace(link.match, ' ') : input).trim();
  return { link, text: rest ? rest : null };
}

export function youtubeIdOk(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}
