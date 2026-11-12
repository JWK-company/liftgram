// 이달의 리프터(SPEC-063) — 앱용 RPC 클라이언트와 달 계산. 운영용(AwardAdminService)은 앱에서 부르지 않는다(프록시가 막는다).
import { AwardService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { lang } from "./i18n";
import { authedTransport } from "./session";

export function awardClient(): Client<typeof AwardService> {
  return createClient(AwardService, authedTransport());
}

/** 꾸준상 문턱(서버 SteadyThreshold 와 같다 — 서버 값을 받기 전 기본) */
export const STEADY_GOAL = 12;
/** 행사 첫 달 — 서버 award.FirstMonth 와 같다 */
export const FIRST_MONTH = "2026-11";

const KST_MS = 9 * 60 * 60 * 1000;

/** 그 시각의 한국 시간 달(YYYY-MM) */
export function kstMonth(ms: number = Date.now()): string {
  const d = new Date(ms + KST_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 그 달의 KST 1일 0시 ~ 다음 달 1일 0시(ms) */
export function kstMonthBounds(month: string): [number, number] {
  const [y, m] = month.split("-").map(Number);
  const from = Date.UTC(y, m - 1, 1) - KST_MS;
  const to = Date.UTC(y, m, 1) - KST_MS;
  return [from, to];
}

/** 다음 달(YYYY-MM) */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 지난 달(YYYY-MM) */
export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** 달 이름 — 「11월」 · 해가 다르면 「2026년 11월」(Intl) */
export function monthLabel(month: string, now: number = Date.now()): string {
  const [y, m] = month.split("-").map(Number);
  const locale = lang === "en" ? "en-US" : "ko-KR";
  const sameYear = kstMonth(now).slice(0, 4) === String(y);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 15)));
}

/** 피드 띠를 닫은 달 — 저장소가 막혀도 화면은 그린다 */
export function bannerDismissed(month: string): boolean {
  try {
    return localStorage.getItem(`awards-banner-dismissed:${month}`) === "1";
  } catch {
    return false;
  }
}

export function dismissBanner(month: string): void {
  try {
    localStorage.setItem(`awards-banner-dismissed:${month}`, "1");
  } catch {
    // 저장이 막혀도 이번 화면에서는 닫힌다
  }
}
