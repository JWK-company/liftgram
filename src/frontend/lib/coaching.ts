// 코칭 v2 연결 화면 공용(SPEC-050 P1b) — 초대 코드 표기·링크·범위 기본값·코치 태그·로그인 전 코드 보관
//
// 코드는 서버가 Crockford base32 8자로 만든다. 화면은 4-4 로 끊어 보이고(읽어 주기 쉽게), 받을 때는
// 하이픈·공백·소문자를 서버가 정리하므로 여기서는 보기만 바꾼다.
import type { AuditEntry, CoachingScope } from "@app/contracts";
import { t, type TransKey } from "@/lib/i18n";

/** 연결 이력 한 줄 — 「때 · 한 일」(코칭 화면 이름 시트 · 회원 화면 「연결 이력」 공용 · SPEC-059) */
export function auditLines(entries: readonly AuditEntry[]): string[] {
  return entries.map((e) => {
    const when = new Date(Number(e.createdAt)).toLocaleString();
    return `${when} · ${t(`coaching.action.${e.action}` as TransKey)}`;
  });
}

/** 코치 태그 — 서버 CoachTagValues 와 같은 6개(순서도 같다). 화면 문구는 coaching.tag.* */
export const COACH_TAGS = ["hypertrophy", "strength", "diet", "rehab", "beginner", "powerlifting"] as const;
export type CoachTag = (typeof COACH_TAGS)[number];
export const MAX_COACH_TAGS = 3;
export const MAX_COACH_BIO = 80;
export const MAX_REQUEST_NOTE = 100;

/** 범위 네 칸만 — proto 메시지의 $typeName 등은 싣지 않는다(요청에 넣을 때 create 가 다시 만든다). */
export interface ScopeValue {
  logView: boolean;
  routineEdit: boolean;
  bodyView: boolean;
  pastRecords: boolean;
}

/** 서버 DefaultScope 와 같다 — 기록·루틴 켬, 체중·지난 기록 끔. */
export const DEFAULT_SCOPE: ScopeValue = {
  logView: true,
  routineEdit: true,
  bodyView: false,
  pastRecords: false,
};

export function scopeOf(s: CoachingScope | undefined | null): ScopeValue {
  if (!s) return { ...DEFAULT_SCOPE };
  return { logView: s.logView, routineEdit: s.routineEdit, bodyView: s.bodyView, pastRecords: s.pastRecords };
}

/** 8자 코드 → 「ABCD-EFGH」. 8자가 아니면 그대로. */
export function formatInviteCode(code: string): string {
  const c = code.replace(/[\s-]/g, "").toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** 받은 코드 정리 — 공백·하이픈 빼고 대문자. 8자 영숫자가 아니면 null(「코드 없음」). */
export function normalizeInviteCode(raw: string): string | null {
  const c = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-Z]{8}$/.test(c) ? c : null;
}

/** 코드를 공유 링크로 — 받는 쪽은 /coaching/join 이 연다. */
export function inviteLink(
  code: string,
  origin = typeof window !== "undefined" ? window.location.origin : "",
): string {
  return `${origin}/coaching/join?code=${encodeURIComponent(code.replace(/[\s-]/g, "").toUpperCase())}`;
}

/** 로그인 뒤 돌아올 주소(AuthClient next 허용 목록과 같은 모양). */
export function joinPath(code: string): string {
  return `/coaching/join?code=${encodeURIComponent(code.replace(/[\s-]/g, "").toUpperCase())}`;
}

/** /account?next= 가 받아 주는 join 주소 — 코드 칸은 영숫자·하이픈 20자까지(서버 GetInvite 상한과 같다). */
export const JOIN_NEXT_RE = /^\/coaching\/join\?code=[0-9A-Za-z-]{1,20}$/;

/** 로그인 전 코드 보관 — 소셜 로그인처럼 주소가 바뀌어 돌아와도 이어 간다(같은 탭 동안만). */
const PENDING_KEY = "liftgram.coachingJoin";

export function stashJoinCode(code: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, code);
  } catch {
    // 저장소가 막힌 창 — 주소의 next 로만 이어 간다
  }
}

export function peekJoinCode(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearJoinCode(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // 무시
  }
}

/** 만료 시각(epoch ms) → 「11월 23일」 */
export function expiryLabel(ms: number, lang: "ko" | "en" = "ko"): string {
  return new Date(ms).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    day: "numeric",
  });
}
