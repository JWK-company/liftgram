// 영상·글 가져오기 초안 보존(SPEC-054 · ADR-063 · 스펙 리뷰 U2·B8).
//
// 새로고침·실수로 나가도 고치던 초안이 남게 sessionStorage 에 둔다(1일 만료 · 저장·버리기 때 지움).
// **원문은 담지 않는다** — 붙여 넣은 글·설명란·못 찾은 줄의 검색어(원문 조각 · 리뷰 REV-114 C12)·날 머리 글·영상 제목·채널은 빼고
// 종목 id·세트·횟수·휴식·메모(정해진 낱말)·시각·상태·근거 종류와 영상 id 만.
// [원본] export const IMPORT_DRAFT_KEY = "liftgram.importDraft";
// [개선] 앱 기록 가져오기(ImportFlow)가 같은 키를 써서 서로 지우던 것(REV-116 P1) — 이 화면 전용 키
export const IMPORT_DRAFT_KEY = "liftgram.routineImportDraft";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type StoredStatus = "auto" | "review" | "none";
export interface StoredItem {
  key: string;
  status: StoredStatus;
  exerciseId: string | null;
  candidates: string[];
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number | null;
  setsStated: boolean;
  repsStated: boolean;
  noteKo: string | null;
  atSec: number | null;
  from: string;
}
export interface StoredDraft {
  v: 1;
  at: number;
  videoId: string | null;
  embeddable: boolean;
  sources: string[];
  routineName: string;
  dayNames: string[];
  days: StoredItem[][];
  mentionedOnly: StoredItem[];
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const NOTE_SHAPE = /^[가-힣A-Za-z0-9 ·~%./()+-]{1,80}$/;
const STATUSES = new Set(["auto", "review", "none"]);
function int(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

/** 원문이 섞일 수 있는 칸을 버리고 정해진 칸만 남긴다(호출하는 쪽이 무엇을 넘겨도) */
export function pickStored(i: StoredItem & Record<string, unknown>): StoredItem {
  return {
    key: String(i.key).slice(0, 40),
    status: STATUSES.has(String(i.status)) ? i.status : "none",
    exerciseId: typeof i.exerciseId === "string" ? i.exerciseId : null,
    // 숫자는 범위 안에서만 · 배열이 아니면 버린다(REV-117 W13)
    candidates: Array.isArray(i.candidates)
      ? i.candidates.filter((c) => typeof c === "string").slice(0, 4)
      : [],
    sets: int(i.sets, 1, 20, 3),
    repsMin: int(i.repsMin, 1, 100, 10),
    repsMax: Math.max(int(i.repsMin, 1, 100, 10), int(i.repsMax, 1, 100, 10)),
    restSec: i.restSec == null ? null : int(i.restSec, 0, 900, 90),
    setsStated: !!i.setsStated,
    repsStated: !!i.repsStated,
    // 메모는 해석기의 정해진 낱말뿐 — 그 모양(한글·영문·숫자·간단한 기호)이 아니면 버린다(REV-116 P17)
    noteKo: typeof i.noteKo === "string" && NOTE_SHAPE.test(i.noteKo) ? i.noteKo.slice(0, 80) : null,
    atSec: i.atSec == null ? null : int(i.atSec, 0, 86_400, 0),
    from: /^[a-z]{1,12}$/.test(String(i.from)) ? String(i.from) : "text",
  };
}

export function saveImportDraft(d: Omit<StoredDraft, "v" | "at">): void {
  const s = storage();
  if (!s) return;
  const out: StoredDraft = {
    v: 1,
    at: Date.now(),
    videoId: d.videoId,
    embeddable: d.embeddable,
    sources: d.sources.filter((x) => /^[a-z]+$/.test(x)),
    routineName: d.routineName.slice(0, 60),
    dayNames: d.dayNames.map((n) => n.slice(0, 60)),
    days: d.days.map((items) => items.map((i) => pickStored(i as StoredItem & Record<string, unknown>))),
    mentionedOnly: d.mentionedOnly.map((i) => pickStored(i as StoredItem & Record<string, unknown>)),
  };
  try {
    s.setItem(IMPORT_DRAFT_KEY, JSON.stringify(out));
  } catch {
    // 저장소가 가득·막힘 — 초안 보존만 못 할 뿐 화면은 그대로
  }
}

export function loadImportDraft(now = Date.now()): StoredDraft | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoredDraft> | null;
    // 모양이 다르면 건너뛰기만(지우지 않는다 — REV-116 P1) · 만료된 우리 초안만 지운다
    if (d?.v !== 1 || typeof d.at !== "number" || !Array.isArray(d.days)) return null;
    if (now - d.at > MAX_AGE_MS) {
      s.removeItem(IMPORT_DRAFT_KEY);
      return null;
    }
    const pick = (i: unknown) => pickStored(i as StoredItem & Record<string, unknown>);
    // 읽을 때도 정해진 칸만(REV-116 P17 · U11)
    return {
      v: 1,
      at: d.at,
      videoId: typeof d.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(d.videoId) ? d.videoId : null,
      embeddable: !!d.embeddable,
      sources: Array.isArray(d.sources)
        ? d.sources.filter((x) => typeof x === "string" && /^[a-z]+$/.test(x))
        : [],
      routineName: typeof d.routineName === "string" ? d.routineName.slice(0, 60) : "",
      dayNames: d.days.map((_, k) =>
        typeof d.dayNames?.[k] === "string" ? String(d.dayNames[k]).slice(0, 60) : "",
      ),
      days: d.days.map((items) => (Array.isArray(items) ? items.map(pick) : [])),
      mentionedOnly: Array.isArray(d.mentionedOnly) ? d.mentionedOnly.map(pick) : [],
    };
  } catch {
    return null;
  }
}

export function clearImportDraft(): void {
  try {
    storage()?.removeItem(IMPORT_DRAFT_KEY);
  } catch {}
}

/** 여러 날을 저장하고 루틴 목록으로 갈 때 띄울 안내 — 목록 화면이 한 번 읽고 지운다 */
export const IMPORT_TOAST_KEY = "liftgram.importToast";
export function setImportToast(count: number): void {
  try {
    storage()?.setItem(IMPORT_TOAST_KEY, String(count));
  } catch {}
}
export function takeImportToast(): number | null {
  try {
    const s = storage();
    const v = s?.getItem(IMPORT_TOAST_KEY);
    if (v == null) return null;
    s?.removeItem(IMPORT_TOAST_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
