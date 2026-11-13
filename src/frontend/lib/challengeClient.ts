// 그룹 챌린지(SPEC-064 · SRS-118~121) — 앱용 RPC 클라이언트 · 하루(04:00 KST 경계) 계산 · 인증 사진 받기(blob).
//
// 인증 사진은 공개 미디어가 아니다 — /api/challenge-proof/<id> 를 Bearer 로 받아 blob 주소로 그린다(<img src> 로 바로 못 연다).
import { ChallengeService, type Rule, routes } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { lang, t, type TransKey } from "./i18n";
import { authedTransport, authInterceptor, freshAccessToken } from "./session";

export function challengeClient(): Client<typeof ChallengeService> {
  return createClient(ChallengeService, authedTransport());
}

/**
 * 인증 사진 올리기 전용 — binary 전송(JSON 이면 bytes 가 base64 로 33% 늘어 서버 한도를 넘는다 · REV-160 11).
 * 인증은 같은 갱신 규칙(authInterceptor)을 쓴다.
 */
export function challengeUploadClient(): Client<typeof ChallengeService> {
  return createClient(
    ChallengeService,
    createConnectTransport({
      baseUrl: routes.apiPrefix,
      useBinaryFormat: true,
      interceptors: [authInterceptor()],
    }),
  );
}

// ── 하루 ────────────────────────────────────────────────────────────────
// 서버 rules.go 와 같다: 하루 = 04:00 KST ~ 다음 날 04:00 KST.
const DAY_SHIFT_MS = (9 - 4) * 60 * 60 * 1000;

/** 그 시각이 속한 챌린지 하루(YYYY-MM-DD) */
export function challengeDay(ms: number = Date.now()): string {
  const d = new Date(ms + DAY_SHIFT_MS);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 에 n일 더하기 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = 월 … 6 = 일 */
export function weekday0Mon(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** 「11월 14일 (금)」 · en 「Fri, Nov 14」 */
export function dayLabel(day: string, opts: { weekday?: boolean } = { weekday: true }): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR", {
    month: "short",
    day: "numeric",
    ...(opts.weekday ? { weekday: "short" } : {}),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** 요일 이름 하나(0 = 월) — 「월」 · en 「Mon」 */
export function weekdayName(i: number): string {
  // 2024-01-01 은 월요일
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, 1 + i)));
}

/** 마지막 날 = 시작 + 주 × 7 − 1 */
export function lastDayOf(rule: Pick<Rule, "startsOn" | "weeks">): string {
  return addDays(rule.startsOn, rule.weeks * 7 - 1);
}

// ── 규칙 글 ───────────────────────────────────────────────────────────────
export const MAX_MEMBERS = 10;

export function scheduleText(rule: Pick<Rule, "ruleKind" | "weekdays">): string {
  if (rule.ruleKind === "daily" || rule.weekdays === 127) return t("challenge.rule.daily");
  const days: string[] = [];
  for (let i = 0; i < 7; i++) if (rule.weekdays & (1 << i)) days.push(weekdayName(i));
  return t("challenge.rule.weekdays", { days: days.join(lang === "en" ? ", " : "·") });
}

export function proofModeText(mode: string): string {
  switch (mode) {
    case "gym":
      return t("challenge.mode.gym");
    case "any_photo":
      return t("challenge.mode.any_photo");
    default:
      return t("challenge.mode.record");
  }
}

/** 한 줄 규칙 — 「매일 · 5세트 이상 · 헬스장 사진 · 4주」 */
export function ruleLine(rule: Rule): string {
  return [
    scheduleText(rule),
    t("challenge.rule.minSets", { n: rule.minSets }),
    proofModeText(rule.proofMode),
    t("challenge.rule.weeks", { n: rule.weeks }),
  ].join(" · ");
}

// ── 지시 ─────────────────────────────────────────────────────────────────
const HAND_KEYS: Record<string, TransKey> = {
  v: "challenge.hand.v",
  thumb: "challenge.hand.thumb",
  palm: "challenge.hand.palm",
  fist: "challenge.hand.fist",
  ok: "challenge.hand.ok",
  three: "challenge.hand.three",
};
const GEAR_KEYS: Record<string, TransKey> = {
  rack: "challenge.gear.rack",
  bench: "challenge.gear.bench",
  cable: "challenge.gear.cable",
  dumbbell: "challenge.gear.dumbbell",
  machine: "challenge.gear.machine",
  plate: "challenge.gear.plate",
};

/** 지시 코드(「v:rack」·「palm」) → 사람이 읽을 글. 모르는 코드는 코드 그대로(새 서버 · 옛 앱) */
export function promptText(code: string): string {
  const [h, g] = code.split(":");
  const hand = HAND_KEYS[h] ? t(HAND_KEYS[h]) : h;
  if (!g) return t("challenge.prompt.handOnly", { hand });
  const gear = GEAR_KEYS[g] ? t(GEAR_KEYS[g]) : g;
  return t("challenge.prompt.handGear", { hand, gear });
}

// ── 칸 ──────────────────────────────────────────────────────────────────
/** 칸 기호 — 색만으로 뜻을 싣지 않는다(기호 + 화면 읽기 이름) */
export function cellSymbol(result: string): string {
  switch (result) {
    case "done":
      return "✓";
    case "made_up":
      return "↺";
    case "pass":
      return t("challenge.cell.passSymbol");
    case "missed_open":
      return "!";
    case "missed":
      return "✕";
    case "rest":
      return "·";
    case "pending":
      return "…";
    default:
      return "";
  }
}

const CELL_KEYS: Record<string, TransKey> = {
  done: "challenge.cell.done",
  made_up: "challenge.cell.made_up",
  pass: "challenge.cell.pass",
  missed_open: "challenge.cell.missed_open",
  missed: "challenge.cell.missed",
  rest: "challenge.cell.rest",
  today: "challenge.cell.today",
  upcoming: "challenge.cell.upcoming",
  pending: "challenge.cell.pending",
};

export function cellName(result: string): string {
  return CELL_KEYS[result] ? t(CELL_KEYS[result]) : t("challenge.cell.outside");
}

/** 「내 오늘」 문구용 — 아직 인정되지 않은 오늘(today)은 「아직 안 함」(「오늘: 오늘」이 되지 않게 · REV-161 M-2) */
export function myTodayName(result: string): string {
  return result === "today" ? t("challenge.cell.todayOpen") : cellName(result);
}

// ── 초대 링크 ─────────────────────────────────────────────────────────────
export function inviteLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://liftgram.tarae.org";
  return `${origin}/challenges/join/${encodeURIComponent(token)}`;
}

// ── 인증 사진 ─────────────────────────────────────────────────────────────
/**
 * 인증 사진 한 장을 blob 주소로. 실패하면 null(404 = 지워졌거나 볼 수 없음).
 * 부른 쪽이 다 쓰면 URL.revokeObjectURL 로 돌려준다.
 */
/** JWT exp 가 30초 안이거나 지났으면 true · 읽지 못하면 false */
function tokenExpiring(token: string): boolean {
  try {
    const body = token.split(".")[1] ?? "";
    const exp = Number(JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))).exp);
    return Number.isFinite(exp) && exp * 1000 - Date.now() < 30_000;
  } catch {
    return false;
  }
}

export async function fetchProofPhoto(proofId: string, signal?: AbortSignal): Promise<string | null> {
  // [원본] currentAccessToken() 만 썼다 — 만료·새로고침 직후면 404 로 「볼 수 없음」이 됐다(REV-162 M-6)
  const get = (token: string) =>
    fetch(`/api/challenge-proof/${encodeURIComponent(proofId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    });
  try {
    const token = await freshAccessToken();
    if (!token) return null;
    let r = await get(token);
    // 서버는 토큰 오류도 같은 404 로 답한다 — 토큰이 곧 끝나거나 끝났을 때만 한 번 갱신해 다시
    // (지워진 사진마다 갱신하면 refresh 가 쓸데없이 회전한다)
    if (r.status === 404 && tokenExpiring(token)) {
      const again = await freshAccessToken(true);
      if (again && again !== token) r = await get(again);
    }
    if (!r.ok) return null;
    return URL.createObjectURL(await r.blob());
  } catch {
    return null;
  }
}
