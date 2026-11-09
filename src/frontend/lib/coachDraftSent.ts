// 코치 초안을 이 기기에서 마지막으로 보낸 내용(SPEC-050 P3b) — 「보내지 않은 변경 있음」 판단용.
// 보낸 때의 지문(coachDraftHash)을 남기고 지금 지문과 비교한다(리뷰 H-1) — 시계 비교는 보기만 하고 나가도·이름을 같은 값으로
// 다시 써도 「변경 있음」이 됐다. at 은 「{날짜} 보냄」을 그릴 때 서버 sent_at 과 함께 본다.
// 저장은 덤이다: 막힌 저장소·다른 기기에서 보낸 초안은 지문이 없다 → 화면이 서버 sent_at 과 고친 때로 대신 판단한다.
const KEY = "liftgram.coachDraftSent.v2";
const OLD_KEY = "liftgram.coachDraftSent.v1"; // 시각만 남기던 옛 칸 — 읽지 않고 치운다
const CAP = 200;

export interface CoachDraftSentMark {
  /** 보낸 내용의 지문 */
  h: string;
  /** 이 기기 시계로 보낸 때(ms) */
  at: number;
}

let cache: Record<string, CoachDraftSentMark> | null = null;

function isMark(v: unknown): v is CoachDraftSentMark {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as CoachDraftSentMark).h === "string" &&
    typeof (v as CoachDraftSentMark).at === "number"
  );
}

function load(): Record<string, CoachDraftSentMark> {
  if (cache) return cache;
  const out: Record<string, CoachDraftSentMark> = {};
  try {
    localStorage.removeItem(OLD_KEY);
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, m] of Object.entries(v)) if (isMark(m)) out[k] = m;
    }
  } catch {
    /* 막힌 저장소 — 빈 채로 */
  }
  cache = out;
  return cache;
}

/** 이 기기에서 보낸 기록(없으면 null). */
export function coachDraftSentMark(draftId: string): CoachDraftSentMark | null {
  return load()[draftId] ?? null;
}

/** 이 기기 시계로 마지막에 보낸 때(없으면 0). */
export function coachDraftSentAt(draftId: string): number {
  return coachDraftSentMark(draftId)?.at ?? 0;
}

export function markCoachDraftSent(draftId: string, hash: string, at = Date.now()): void {
  const next = { ...load(), [draftId]: { h: hash, at } };
  const keys = Object.keys(next);
  if (keys.length > CAP) {
    for (const k of keys.sort((a, b) => next[a].at - next[b].at).slice(0, keys.length - CAP)) delete next[k];
  }
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 저장이 막힌 브라우저 — 서버 sent_at 으로만 판단한다 */
  }
}

/** 초안을 지웠다 — 그 기록도 걷는다. */
export function forgetCoachDraftSent(draftId: string): void {
  const cur = load();
  if (!(draftId in cur)) return;
  const next = { ...cur };
  delete next[draftId];
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 무시 */
  }
}

/** 로그아웃 — 그 사람 것이다(session.clearTokens 가 부른다). */
export function clearCoachDraftSent(): void {
  cache = null;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OLD_KEY);
  } catch {
    /* 무시 */
  }
}
