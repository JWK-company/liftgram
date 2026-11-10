"use client";
// 영상·글로 루틴 가져오기(SPEC-054 Phase 3 · SRS-116 · ADR-063).
//
// 입력(한 칸: 링크·글·「스크립트 표시」 복사본) → 「초안 만들기」 → 확인 화면(줄마다 상태·근거 시각·기본값 표시) → 내 루틴 저장.
//   - 링크가 있으면 서버(DescribeVideo)에 영상 id 만 보내 설명란·길이·임베드 가능 여부를 받는다. 붙여 넣은 원문은 어떤 요청에도 싣지 않는다.
//   - 해석은 기기 안 규칙(@app/core/domain/videoImport)만 — 라이브 LLM·외부 해석 서비스 없음.
//   - 원문·설명란·제목·채널은 이 컴포넌트 상태에만. 초안 보존(sessionStorage)은 lib/importDraft 가 정해진 칸만 담는다.
//   - 저장: 하루짜리는 그 루틴 편집기로 바로(replace) · 여러 날이면 루틴 목록 + 「루틴 N개를 저장했어요」.
import { youtubeWatchUrl } from "@app/core";
import type { SearchableExercise } from "@app/core/domain/exerciseSearch";
import {
  buildImportDraft,
  buildMentionIndex,
  type DraftItem,
  looksLikeScript,
  type MentionIndex,
  splitLinkAndText,
} from "@app/core/domain/videoImport/index";
import { Code, ConnectError } from "@connectrpc/connect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  clearImportDraft,
  loadImportDraft,
  saveImportDraft,
  setImportToast,
  type StoredDraft,
  type StoredItem,
} from "@/lib/importDraft";
import { trackUsage } from "@/lib/usage";
import { appVersionOf } from "@/lib/platform";
import { videoClient } from "@/lib/videoClient";
import ExercisePickerScreen, { type Pick } from "../ExercisePickerScreen";
import { Button } from "../ui/Button";
import { runAfterOverlays } from "@/lib/useBackToClose"; // 창 칸 정리 뒤에(REV-116 U1)
import { closeTopOverlay, ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { AppText } from "../ui/primitives";
import ImportRowSheet, { type RowValues } from "./ImportRowSheet";

/** 화면의 줄 — 보존 칸 + 검색어(원문 조각이라 상태에만) */
export type Row = StoredItem & { query: string };
export interface Day {
  name: string;
  items: Row[];
  /** 여러 날 중 이미 저장한 날(부분 실패 뒤) — 지우지 않고 건너뛴다(이름이 바뀌지 않게 · REV-117 W3) */
  saved?: boolean;
}
export interface Review {
  videoId: string | null;
  /** API 로 받은 제목·채널 — 화면에만(저장 안 함 · YouTube API 정책) */
  title: string | null;
  channel: string | null;
  embeddable: boolean;
  sources: string[];
  routineName: string;
  days: Day[];
  mentionedOnly: Row[];
}

const DESCRIBE_TIMEOUT_MS = 7_000;

let keySeq = 0;
function newKey(): string {
  keySeq += 1;
  return `n${Date.now().toString(36)}${keySeq}`;
}

function dateLabel(d = new Date()): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function toRow(i: DraftItem): Row {
  return {
    key: newKey(),
    status: i.status,
    exerciseId: i.exerciseId,
    candidates: i.candidates,
    sets: i.sets,
    repsMin: i.repsMin,
    repsMax: i.repsMax,
    restSec: i.restSec,
    setsStated: i.setsStated,
    repsStated: i.repsStated,
    noteKo: i.noteKo,
    atSec: i.atSec,
    from: i.from,
    query: i.query,
  };
}

export function blankRow(atSec: number | null, exerciseId: string | null = null): Row {
  return {
    key: newKey(),
    status: exerciseId ? "auto" : "none",
    exerciseId,
    candidates: [],
    sets: 3,
    repsMin: 10,
    repsMax: 10,
    restSec: null,
    setsStated: false,
    repsStated: false,
    noteKo: null,
    atSec,
    from: "watch",
    query: "",
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof ConnectError) {
    switch (e.code) {
      case Code.Unauthenticated:
        return t("routineImport.errLogin");
      case Code.NotFound:
        return t("routineImport.errNotFound");
      case Code.ResourceExhausted:
        return /[가-힣]/.test(e.rawMessage) ? e.rawMessage : t("routineImport.errUnavailable");
      default:
        return t("routineImport.errUnavailable");
    }
  }
  return t("routineImport.errUnavailable");
}

async function loadIndex(): Promise<MentionIndex> {
  const repo = await import("@app/core/data/exerciseRepository");
  const models = await repo.queryExercises({}).fetch();
  const list: SearchableExercise[] = models.map((m) => {
    const e = m as unknown as SearchableExercise;
    return {
      id: e.id,
      nameKo: e.nameKo,
      nameEn: e.nameEn ?? null,
      aliases: e.aliases ?? [],
      family: e.family ?? null,
      equipment: e.equipment ?? null,
      isArchived: e.isArchived ?? false,
    };
  });
  return buildMentionIndex(list);
}

function fromStored(d: StoredDraft): Review {
  return {
    videoId: d.videoId,
    title: null,
    channel: null,
    embeddable: d.embeddable,
    sources: d.sources,
    routineName: d.routineName,
    days: d.days.map((items, i) => ({
      name: d.dayNames[i] ?? t("routineImport.dayLabel", { n: i + 1 }),
      items: items.map((x) => ({ ...x, query: "" })),
    })),
    mentionedOnly: d.mentionedOnly.map((x) => ({ ...x, query: "" })),
  };
}

type PickerFor =
  | { kind: "row"; day: number; key: string; query: string; title: string }
  | { kind: "add"; day: number };

export default function RoutineImport({
  renderWatch,
}: {
  /** Phase 4 — 받아 적기 화면(영상 id·시각을 받아 줄을 더한다). 없으면 「▶」는 유튜브 새 창 */
  renderWatch?: (p: {
    review: Review;
    startSec: number | null;
    nameOf: (id: string | null) => string;
    /** 확인 화면 상태를 함수형으로 고친다(REV-116 U7 — 통째 교체 대신) */
    update: (fn: (r: Review) => Review) => void;
    onBack: () => void;
  }) => React.ReactNode;
} = {}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [resume, setResume] = useState<StoredDraft | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [picker, setPicker] = useState<PickerFor | null>(null);
  const [sheetFor, setSheetFor] = useState<{ day: number; key: string } | null>(null);
  const [menuFor, setMenuFor] = useState<{ day: number; key: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [dupe, setDupe] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [watch, setWatch] = useState<{ startSec: number | null } | null>(null);
  /** 링크만 넣었는데 설명란을 못 읽었을 때 — 받아 적기로 이어 갈 영상 */
  const [videoOnly, setVideoOnly] = useState<{ videoId: string; embeddable: boolean } | null>(null);
  const indexRef = useRef<Promise<MentionIndex> | null>(null);
  const savingRef = useRef(false);
  const exitingRef = useRef(false);
  /** 저장·나가기를 확정했다 — 초안 보존을 끈다(exitingRef 는 떠나는 중 표시라 되돌려질 수 있다 · REV-117 W2) */
  const doneRef = useRef(false);
  const [guardEpoch, setGuardEpoch] = useState(0);

  // 처음 — 남은 초안 · 붙여넣기 버튼
  useEffect(() => {
    setResume(loadImportDraft());
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);

  const index = useCallback(() => {
    if (!indexRef.current) indexRef.current = loadIndex();
    return indexRef.current;
  }, []);

  // 표시 이름 — 줄의 종목 + 후보 + 언급만
  const ids = useMemo(() => {
    if (!review) return [] as string[];
    const all = [...review.days.flatMap((d) => d.items), ...review.mentionedOnly];
    return [...new Set(all.flatMap((r) => [r.exerciseId, ...r.candidates]).filter((x): x is string => !!x))];
  }, [review]);
  const idsKey = ids.join(",");
  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    void import("@app/core/data/exerciseNames")
      .then((m) => m.getExerciseDisplayNameMap(idsKey.split(",")))
      .then((m) => {
        if (alive) setNames((prev) => new Map([...prev, ...m]));
      })
      .catch((e) => console.warn("가져오기 종목 이름 실패", e));
    return () => {
      alive = false;
    };
  }, [idsKey]);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? "…") : t("routineImport.pickExercise"));

  // 초안 보존 — 확인 화면의 줄이 바뀔 때마다(원문 없음)
  useEffect(() => {
    if (!review || doneRef.current) return;
    saveImportDraft({
      videoId: review.videoId,
      embeddable: review.embeddable,
      sources: review.sources,
      routineName: review.routineName,
      dayNames: review.days.map((d) => d.name),
      days: review.days.map((d) => d.items),
      mentionedOnly: review.mentionedOnly,
    });
  }, [review]);

  const rowCount = review ? review.days.reduce((n, d) => n + d.items.length, 0) : 0;
  /** 앱 껍데기 — 받아 적기도 새 창 대체라 ▶ 는 바로 유튜브로(REV-117 Y10) */
  const [inAppShell, setInAppShell] = useState(false);
  useEffect(() => {
    setInAppShell(appVersionOf(navigator.userAgent) != null);
  }, []);

  // 나가기 확인 — 줄이 1개 이상일 때 뒤로·화면 안 링크(탭 막대)를 받는다. 칸 규약은 RoutineEditor·ExercisePickerScreen 과 같다.
  // [원본] const guardOn = !!review && rowCount > 0 && !watch;
  // [개선] 칸은 확인 화면이 있는 동안 하나로 유지하고, 줄 수·받아 적기는 ref 로 판단한다(REV-116 U2 — 줄 0↔1 이 바뀔 때
  //        칸을 걷고 쌓다 back 뒤 push 경합으로 나가기 확인이 엉뚱하게 뜨던 것). 받아 적기도 이 칸을 같이 쓴다(뒤로 = 확인 화면으로).
  const guardOn = !!review;
  const rowCountRef = useRef(0);
  rowCountRef.current = rowCount;
  const watchRef = useRef(false);
  watchRef.current = !!watch;
  const guardTokenRef = useRef<string | null>(null);
  const leaveRef = useRef<(href: string) => Promise<void>>(async () => {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: guardEpoch — 가드를 걷은 뒤 이동이 실패하면 다시 쌓는 열쇠(REV-117 W4)
  useEffect(() => {
    if (!guardOn) return;
    const token = `import-${Math.random().toString(36).slice(2)}`;
    guardTokenRef.current = token;
    history.pushState({ ...(history.state ?? {}), liftgramTop: token }, "");
    let mine = true;
    const onPop = () => {
      if (exitingRef.current || !mine) return;
      if (history.state?.liftgramTop === token) return; // 위 칸(선택 창)이 닫혀 우리 칸으로 돌아왔다
      if (savingRef.current) {
        // 저장 중 — 칸만 되살리고 창은 띄우지 않는다(이동 두 개가 겹치지 않게 · REV-117 W5)
        history.pushState({ ...(history.state ?? {}), liftgramTop: token }, "");
        return;
      }
      if (!rowCountRef.current && !watchRef.current) {
        // 적은 것이 없다 — 그대로 떠난다(칸은 이미 빠졌다). 바로 아래도 이 화면이면(묻힌 칸·새로고침 뒤) 떠나지 못한 것이니
        // 되돌리고 칸을 다시 쌓는다 — 그대로 두면 가드가 꺼진 채 굳는다(REV-117 W2)
        exitingRef.current = true;
        const here = location.pathname;
        const check = () => {
          window.removeEventListener("popstate", check);
          window.clearTimeout(timer);
          if (location.pathname !== here || !mine) return;
          exitingRef.current = false;
          history.pushState({ ...(history.state ?? {}), liftgramTop: token }, "");
        };
        const timer = window.setTimeout(check, 600);
        window.addEventListener("popstate", check);
        history.back();
        return;
      }
      history.pushState({ ...(history.state ?? {}), liftgramTop: token }, "");
      if (closeTopOverlay()) return;
      if (watchRef.current) setWatch(null);
      else setLeaveTo("/");
    };
    const onClick = (e: MouseEvent) => {
      if (exitingRef.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href?.startsWith("/") || (a.target && a.target !== "_self")) return;
      if (href === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      if (savingRef.current) return; // 저장 중에는 떠나지 않는다(W5)
      // 적은 것이 없으면 묻지 않고 떠나되, 칸을 걷고 바꿔치기한다 — 그냥 두면 칸이 묻혀 뒤로가 헛돈다(REV-117 W1)
      if (!rowCountRef.current && !watchRef.current) void leaveRef.current(href);
      else setLeaveTo(href);
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      mine = false;
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
      if (guardTokenRef.current === token) guardTokenRef.current = null;
      if (!exitingRef.current && history.state?.liftgramTop === token) history.back();
    };
  }, [guardOn, guardEpoch]);

  /** 가드 칸을 걷는다 — 떠나기 전에(REV-116 U1 · RoutineEditor dropGuard 와 같은 방식). 그래야 replace 가 import 칸을 바꾼다. */
  const dropGuard = useCallback(async () => {
    await new Promise<void>((r) => runAfterOverlays(r));
    const token = guardTokenRef.current;
    guardTokenRef.current = null;
    if (!token || history.state?.liftgramTop !== token) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener("popstate", done);
        resolve();
      };
      window.addEventListener("popstate", done);
      history.back();
      setTimeout(done, 400);
    });
  }, []);

  const leave = async (href: string) => {
    exitingRef.current = true;
    doneRef.current = true;
    await dropGuard();
    const nav = await import("@/lib/localDb");
    await nav.navigateAfterFlush(href, { replace: true });
  };
  leaveRef.current = leave;

  // ── 초안 만들기 ──
  const make = async () => {
    const raw = input.trim();
    if (!raw) {
      setError(t("routineImport.errEmpty"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setVideoOnly(null);
    try {
      const { link, text } = splitLinkAndText(raw);
      let description: string | null = null;
      let meta: { title: string; channel: string; embeddable: boolean } | null = null;
      let dropVideo = false;
      if (link) {
        try {
          const res = await videoClient().describeVideo(
            { videoId: link.videoId },
            { timeoutMs: DESCRIBE_TIMEOUT_MS },
          );
          description = res.description;
          meta = { title: res.title, channel: res.channel, embeddable: res.embeddable };
        } catch (e) {
          if (!text) {
            setError(errorMessage(e));
            // 영상을 못 읽어도 보며 받아 적기는 할 수 있다(없는 영상 빼고)
            if (!(e instanceof ConnectError && e.code === Code.NotFound)) {
              setVideoOnly({ videoId: link.videoId, embeddable: true });
            }
            return;
          }
          setNotice(errorMessage(e));
          // 없는 영상이면 출처로 남기지 않는다(REV-116 U9)
          if (e instanceof ConnectError && e.code === Code.NotFound) dropVideo = true;
        }
      }
      const idx = await index();
      const d = buildImportDraft(idx, { text, description });
      const days: Day[] = d.days
        .filter((x) => x.items.length)
        .map((x, i, all) => ({
          name: all.length > 1 ? t("routineImport.dayLabel", { n: i + 1 }) : "",
          items: x.items.map(toRow),
        }));
      const mentionedOnly = d.mentionedOnly.map(toRow);
      if (!days.length && !mentionedOnly.length) {
        setError(t(link ? "routineImport.errNothing" : "routineImport.errNothingText"));
        if (link) setVideoOnly({ videoId: link.videoId, embeddable: meta?.embeddable ?? true });
        return;
      }
      const sources = (["desc", "script", "text"] as const)
        .filter((k) => (d.lines[k] ?? 0) > 0)
        .map((k) => (k === "desc" ? "description" : k));
      trackUsage("routine_import_draft");
      setReview({
        videoId: dropVideo ? null : (link?.videoId ?? null),
        title: meta?.title ?? null,
        channel: meta?.channel ?? null,
        embeddable: meta?.embeddable ?? false,
        sources,
        routineName: t(
          link && !dropVideo ? "routineImport.defaultVideoName" : "routineImport.defaultTextName",
          {
            date: dateLabel(),
          },
        ),
        days: days.length ? days : [{ name: "", items: [] }],
        mentionedOnly,
      });
      setResume(null);
    } finally {
      setBusy(false);
    }
  };

  // 링크만 — 받아 적기로 바로(설명란을 못 읽었거나 종목이 없을 때)
  const startWatchOnly = () => {
    if (!videoOnly) return;
    setReview({
      videoId: videoOnly.videoId,
      title: null,
      channel: null,
      embeddable: videoOnly.embeddable,
      sources: ["watch"],
      routineName: t("routineImport.defaultVideoName", { date: dateLabel() }),
      days: [{ name: "", items: [] }],
      mentionedOnly: [],
    });
    setWatch({ startSec: null });
    setError(null);
  };

  // ── 줄 고치기 ──
  const patchRow = (day: number, key: string, patch: Partial<Row>) =>
    setReview((r) =>
      r
        ? {
            ...r,
            days: r.days.map((d, i) =>
              i !== day ? d : { ...d, items: d.items.map((x) => (x.key === key ? { ...x, ...patch } : x)) },
            ),
          }
        : r,
    );
  const findRow = (day: number, key: string) => review?.days[day]?.items.find((x) => x.key === key) ?? null;

  /** 같은 문구가 이어져도 다시 읽히게 비웠다가 넣는다(REV-116 P16) */
  const announce = (msg: string) => {
    setLive("");
    requestAnimationFrame(() => setLive(msg));
  };

  const move = (day: number, key: string, delta: -1 | 1) => {
    if (!review) return;
    const cur = review.days[day].items;
    const i = cur.findIndex((x) => x.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= cur.length) return;
    setReview((r) => {
      if (!r) return r;
      const items = [...r.days[day].items];
      const a = items.findIndex((x) => x.key === key);
      const b = a + delta;
      if (a < 0 || b < 0 || b >= items.length) return r;
      [items[a], items[b]] = [items[b], items[a]];
      return { ...r, days: r.days.map((d, k) => (k === day ? { ...d, items } : d)) };
    });
    announce(t("routineImport.moved", { n: j + 1 }));
    // 옮긴 줄의 ⋯ 로 포커스를 돌려준다(스펙 리뷰 접근성)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-menu="${key}"]`)?.focus());
  };
  const remove = (day: number, key: string) => {
    if (!review) return;
    const row = findRow(day, key);
    const items = review.days[day]?.items ?? [];
    const at = items.findIndex((x) => x.key === key);
    const next = items[at + 1] ?? items[at - 1] ?? null;
    setReview((r) =>
      r
        ? {
            ...r,
            days: r.days.map((d, k) =>
              k === day ? { ...d, items: d.items.filter((x) => x.key !== key) } : d,
            ),
          }
        : r,
    );
    announce(t("routineImport.removed", { name: row ? nameOf(row.exerciseId) : "" }));
    // 지운 줄의 ⋯ 가 없어지니 다음(없으면 이전) 줄의 ⋯, 줄이 없으면 「+ 종목 더하기」로(REV-116 P13)
    runAfterOverlays(() =>
      requestAnimationFrame(() =>
        (next
          ? document.querySelector<HTMLElement>(`[data-row-menu="${next.key}"]`)
          : document.querySelector<HTMLElement>(`[data-testid="import-add"]`)
        )?.focus(),
      ),
    );
  };

  const onNamePress = (day: number, row: Row) => {
    if (row.status === "review" && row.candidates.length) {
      setExpanded((k) => (k === row.key ? null : row.key));
      return;
    }
    setPicker({
      kind: "row",
      day,
      key: row.key,
      query: row.exerciseId ? "" : row.query,
      title: row.exerciseId ? t("routineImport.changeExercise") : t("routineImport.pickExercise"),
    });
  };

  const onPicked = (picks: Pick[]) => {
    const p = picker;
    setPicker(null);
    if (!p || !review || !picks.length) return;
    if (p.kind === "row") {
      patchRow(p.day, p.key, { exerciseId: picks[0].exerciseId, status: "auto", candidates: [], query: "" });
      setExpanded(null);
      return;
    }
    const add = picks.map((x) => ({ ...blankRow(null, x.exerciseId), from: "text" }));
    setReview((r) =>
      r ? { ...r, days: r.days.map((d, k) => (k === p.day ? { ...d, items: [...d.items, ...add] } : d)) } : r,
    );
  };

  const addMentioned = (row: Row) => {
    if (!review) return;
    // [원본] status: row.exerciseId ? "auto" : row.status — 모호한 언급의 「확인 필요」가 사라졌다
    // [개선] 상태는 그대로(REV-116 U3) — 후보 여럿이면 확인 필요 · 저장 확인창을 거친다
    setReview((r) => {
      if (!r) return r;
      const last = r.days.length - 1;
      return {
        ...r,
        days: r.days.map((d, k) => (k === last ? { ...d, items: [...d.items, { ...row }] } : d)),
        mentionedOnly: r.mentionedOnly.filter((x) => x.key !== row.key),
      };
    });
    announce(t("routineImport.addedMentioned", { name: nameOf(row.exerciseId) }));
  };

  // ── 저장 ──
  const counts = useMemo(() => {
    const all = review?.days.filter((d) => !d.saved).flatMap((d) => d.items) ?? [];
    return {
      unresolved: all.filter((x) => !x.exerciseId).length,
      review: all.filter((x) => x.exerciseId && x.status === "review").length,
      savable: all.filter((x) => x.exerciseId).length,
    };
  }, [review]);

  /** 저장할 이름 — 중복 확인과 저장이 같은 결과를 쓴다(REV-116 U5). 빈 이름은 기본값 · 빈 날 이름은 「N일차」 */
  const dayNames = (r: Review) => {
    const base =
      r.routineName.trim() ||
      t(r.videoId ? "routineImport.defaultVideoName" : "routineImport.defaultTextName", {
        date: dateLabel(),
      });
    return r.days.map((d, i) =>
      r.days.length > 1 ? `${base} · ${d.name.trim() || t("routineImport.dayLabel", { n: i + 1 })}` : base,
    );
  };
  const routineNames = (r: Review) =>
    dayNames(r).filter((_, i) => !r.days[i].saved && r.days[i].items.some((x) => x.exerciseId));

  const checkingRef = useRef(false);
  const onSave = async () => {
    if (!review || savingRef.current || checkingRef.current) return;
    if (!counts.savable) {
      setError(t("routineImport.saveNothing"));
      return;
    }
    if (!confirmSave && (counts.unresolved || counts.review)) {
      setConfirmSave(true);
      return;
    }
    setConfirmSave(false);
    if (!dupe) {
      // 확인하는 동안에도 다시 누르지 못하게(REV-116 U6)
      checkingRef.current = true;
      setBusy(true);
      try {
        const repo = await import("@app/core/data/routineRepository");
        const existing = new Set((await repo.queryRoutines().fetch()).map((x) => x.name));
        const mine = routineNames(review);
        // 같은 가져오기 안에서 겹치는 이름도
        if (mine.some((n, i) => existing.has(n) || mine.indexOf(n) !== i)) {
          setDupe(true);
          return;
        }
      } finally {
        checkingRef.current = false;
        setBusy(false);
      }
    }
    await doSave();
  };

  const doSave = async () => {
    if (!review || savingRef.current) return;
    savingRef.current = true;
    setDupe(false);
    setBusy(true);
    const made: string[] = [];
    const savedDays: number[] = [];
    try {
      const repo = await import("@app/core/data/routineRepository");
      const notes = review.videoId
        ? t("routineImport.sourceNote", { url: youtubeWatchUrl(review.videoId) })
        : null;
      const names = dayNames(review);
      for (const [di, d] of review.days.entries()) {
        if (d.saved) continue;
        const items = d.items
          .filter((x) => x.exerciseId)
          .map((x) => ({
            exerciseId: x.exerciseId as string,
            targetSets: x.sets,
            targetRepsMin: x.repsMin,
            targetRepsMax: x.repsMax,
            restSeconds: x.restSec,
            note: x.noteKo,
          }));
        if (!items.length) continue;
        const r = await repo.importRoutine(names[di], items, { notes });
        trackUsage("routine_import");
        made.push(r.id);
        savedDays.push(di);
      }
      clearImportDraft();
      exitingRef.current = true;
      doneRef.current = true;
      await dropGuard();
      const nav = await import("@/lib/localDb");
      const total = made.length + review.days.filter((d) => d.saved).length;
      if (total === 1 && made.length === 1)
        await nav.navigateAfterFlush(`/routines/${made[0]}`, { replace: true });
      else {
        setImportToast(total);
        await nav.navigateAfterFlush("/", { replace: true });
      }
    } catch (e) {
      console.error("가져온 루틴 저장 실패", e);
      // 여러 날 중 일부만 저장됐으면 그 날은 빼서 다시 저장할 때 겹치지 않게(REV-116 U4)
      // [원본] 저장한 날을 days 에서 뺐다 — 남은 날이 하나면 「· N일차」가 빠져 이름이 바뀌었다(REV-117 W3)
      // [개선] 지우지 않고 saved 표시 — 저장·중복 확인에서만 건너뛴다
      if (savedDays.length) {
        const done = new Set(savedDays);
        setReview((r) =>
          r ? { ...r, days: r.days.map((d, i) => (done.has(i) ? { ...d, saved: true } : d)) } : r,
        );
        setError(t("routineImport.savePartial", { count: savedDays.length }));
      } else setError(t("common.error"));
      exitingRef.current = false;
      doneRef.current = false;
      // 가드를 이미 걷었으면 다시 쌓는다(W4)
      if (!guardTokenRef.current) setGuardEpoch((n) => n + 1);
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const leaveDialog = leaveTo ? (
    <ConfirmDialog
      testId="import-leave"
      title={t("routineImport.leaveTitle")}
      message={t("routineImport.leaveMessage")}
      confirmLabel={t("routineImport.leave")}
      onCancel={() => setLeaveTo(null)}
      onConfirm={() => {
        const to = leaveTo;
        setLeaveTo(null);
        void leave(to);
      }}
    />
  ) : null;

  // ── 받아 적기(Phase 4) ──
  if (review && watch && renderWatch) {
    return (
      <>
        {renderWatch({
          review,
          startSec: watch.startSec,
          nameOf,
          update: (fn) => setReview((r) => (r ? fn(r) : r)),
          onBack: () => {
            setWatch(null);
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('[data-testid="import-watch"]')?.focus(),
            );
          },
        })}
        {leaveDialog}
      </>
    );
  }

  const sheetRow = sheetFor ? findRow(sheetFor.day, sheetFor.key) : null;
  const menuRow = menuFor ? findRow(menuFor.day, menuFor.key) : null;
  const scriptLike = !review && input.length > 40 && looksLikeScript(input);

  return (
    <div className="mx-auto w-full max-w-[640px] px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[calc(var(--spacing-xl)*3)]">
      <p aria-live="polite" className="sr-only" data-testid="import-live">
        {live}
      </p>
      <header className="mb-[var(--spacing-md)] flex items-center gap-[var(--spacing-sm)]">
        <a
          href="/"
          aria-label={t("routineImport.back")}
          className="inline-flex h-11 w-11 items-center justify-center"
          data-testid="import-back"
        >
          <Icon name="chevron-back" size={24} color="var(--color-ink)" />
        </a>
        <h1 className="flex-1 font-bold text-[length:var(--text-lg)]">{t("routineImport.title")}</h1>
      </header>

      {!review ? (
        <section data-testid="import-input">
          <AppText variant="caption" color="textMuted" className="block">
            {t("routineImport.lead")}
          </AppText>

          {resume ? (
            <div
              data-testid="import-resume"
              className="mt-[var(--spacing-md)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-md)]"
            >
              <AppText variant="body" className="block font-semibold">
                {t("routineImport.resumeTitle")}
              </AppText>
              <div className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-sm)]">
                <Button
                  title={t("routineImport.resume")}
                  variant="secondary"
                  fullWidth={false}
                  testId="import-resume-go"
                  onPress={() => {
                    setReview(fromStored(resume));
                    setResume(null);
                  }}
                />
                <Button
                  title={t("routineImport.discard")}
                  variant="quiet"
                  fullWidth={false}
                  testId="import-resume-discard"
                  onPress={() => {
                    clearImportDraft();
                    setResume(null);
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-[var(--spacing-md)] flex items-end justify-between">
            <label htmlFor="import-text">
              <AppText variant="label" color="textMuted">
                {t("routineImport.inputLabel")}
              </AppText>
            </label>
            {canPaste ? (
              <button
                type="button"
                data-testid="import-paste"
                className="min-h-[44px] px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)] underline"
                onClick={async () => {
                  try {
                    const v = await navigator.clipboard.readText();
                    if (v) setInput(v);
                  } catch {
                    setCanPaste(false); // 권한이 막히면 버튼을 숨긴다(직접 붙여넣기는 된다)
                  }
                }}
              >
                {t("routineImport.paste")}
              </button>
            ) : null}
          </div>
          <TextArea
            id="import-text"
            testId="import-text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t("routineImport.inputPlaceholder")}
            rows={4}
          />
          {scriptLike ? (
            <AppText
              variant="caption"
              color="textMuted"
              className="block"
              data-testid="import-script-detected"
            >
              {t("routineImport.scriptDetected")}
            </AppText>
          ) : null}

          <details className="mt-[var(--spacing-sm)]">
            <summary className="min-h-[44px] cursor-pointer py-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]">
              {t("routineImport.help")}
            </summary>
            <AppText variant="caption" color="textMuted" className="block">
              {t("routineImport.helpPhone")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
              {t("routineImport.helpDesktop")}
            </AppText>
          </details>

          {error ? (
            <p
              role="alert"
              data-testid="import-error"
              className="mt-[var(--spacing-md)] text-(--color-bad) text-[length:var(--text-sm)]"
            >
              {error}
            </p>
          ) : null}
          {videoOnly && renderWatch ? (
            <div className="mt-[var(--spacing-sm)]">
              <Button
                title={t("routineImport.watchInstead")}
                variant="secondary"
                testId="import-watch-only"
                onPress={startWatchOnly}
              />
            </div>
          ) : null}

          <div className="mt-[var(--spacing-lg)]">
            <Button
              title={busy ? t("routineImport.reading") : t("routineImport.make")}
              loading={busy}
              testId="import-make"
              onPress={() => void make()}
            />
          </div>
          {busy ? <DraftSkeleton /> : null}
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-md)] block">
            {t("routineImport.privacyNote")}
          </AppText>
          <div className="flex flex-wrap gap-x-[var(--spacing-md)]">
            <a
              href="/privacy#youtube"
              className="inline-flex min-h-[44px] items-center text-(--color-ink2) text-[length:var(--text-xs)] underline"
              data-testid="import-privacy-link"
            >
              {t("routineImport.privacyLink")}
            </a>
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center text-(--color-ink2) text-[length:var(--text-xs)] underline"
            >
              {t("routineImport.ytTerms")}
              <span className="sr-only"> {t("routineImport.newWindow")}</span>
            </a>
          </div>
        </section>
      ) : (
        <section data-testid="import-review">
          {review.videoId ? (
            <div className="mb-[var(--spacing-sm)]">
              {review.title ? (
                <a
                  href={youtubeWatchUrl(review.videoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-semibold text-(--color-ink) text-[length:var(--text-md)] underline decoration-(--color-line-strong) underline-offset-2"
                  data-testid="import-video-title"
                >
                  {review.title}
                  <span className="sr-only"> {t("routineImport.newWindow")}</span>
                </a>
              ) : null}
              {review.channel ? (
                <AppText variant="caption" color="textMuted" className="block">
                  {review.channel}
                </AppText>
              ) : null}
              <div className="flex flex-wrap gap-x-[var(--spacing-md)]">
                <a
                  href={youtubeWatchUrl(review.videoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center text-(--color-ink2) text-[length:var(--text-sm)] underline"
                  data-testid="import-open-video"
                >
                  {t("routineImport.openOnYoutube")}
                  <span className="sr-only"> {t("routineImport.newWindow")}</span>
                </a>
                <a
                  href="https://www.youtube.com/t/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center text-(--color-ink2) text-[length:var(--text-sm)] underline"
                  data-testid="import-yt-terms"
                >
                  {t("routineImport.ytTerms")}
                  <span className="sr-only"> {t("routineImport.newWindow")}</span>
                </a>
              </div>
            </div>
          ) : null}
          {review.sources.length ? (
            <AppText variant="caption" color="textMuted" className="block" data-testid="import-sources">
              {t("routineImport.readFrom", {
                sources: review.sources
                  .map((s) => t(`routineImport.src.${s}` as "routineImport.src.text"))
                  .join(" · "),
              })}
            </AppText>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="mt-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-sm)]"
            >
              {notice}
            </p>
          ) : null}

          <div className="mt-[var(--spacing-md)]">
            <label htmlFor="import-name">
              <AppText variant="label" color="textMuted">
                {t("routineImport.routineName")}
              </AppText>
            </label>
            <input
              id="import-name"
              data-testid="import-name"
              value={review.routineName}
              maxLength={60}
              onChange={(e) => {
                const v = e.target.value;
                setReview((r) => (r ? { ...r, routineName: v } : r));
              }}
              disabled={busy}
              className="mt-[var(--spacing-xs)] w-full rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-md)] text-(--color-ink)"
            />
          </div>

          {review.videoId && renderWatch ? (
            <div className="mt-[var(--spacing-sm)]">
              <Button
                title={t("routineImport.watchMode")}
                variant="secondary"
                icon="play"
                testId="import-watch"
                onPress={() => setWatch({ startSec: null })}
              />
            </div>
          ) : null}

          {review.days.map((d, di) =>
            d.saved ? (
              // 이미 저장한 날(부분 실패 뒤 · REV-117 W3) — 이름은 저장 때 겹침을 막아 유일하다
              <p
                key={`saved:${dayNames(review)[di]}`}
                data-testid="import-day-saved"
                className="mt-[var(--spacing-lg)] text-(--color-ink2) text-[length:var(--text-sm)]"
              >
                {t("routineImport.daySaved", { name: dayNames(review)[di] })}
              </p>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: 날은 순서가 바뀌지 않고 더하거나 빼지도 않는다
              <div key={di} className="mt-[var(--spacing-lg)]" data-testid="import-day">
                {review.days.length > 1 ? (
                  <input
                    aria-label={t("routineImport.dayNameN", { n: di + 1 })}
                    data-testid="import-day-name"
                    value={d.name}
                    maxLength={40}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReview((r) =>
                        r ? { ...r, days: r.days.map((x, k) => (k === di ? { ...x, name: v } : x)) } : r,
                      );
                    }}
                    className="mb-[var(--spacing-sm)] w-full rounded-[var(--radius-sm)] border border-(--color-line) bg-transparent min-h-[44px] px-[var(--spacing-sm)] py-[var(--spacing-xs)] font-semibold text-(--color-ink)"
                  />
                ) : null}
                <ul className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>li+li]:border-(--color-line) [&>li+li]:border-t">
                  {d.items.map((row) => (
                    <RowCard
                      key={row.key}
                      row={row}
                      name={nameOf(row.exerciseId)}
                      names={names}
                      expanded={expanded === row.key}
                      videoId={review.videoId}
                      onName={() => onNamePress(di, row)}
                      onCandidate={(id) => {
                        patchRow(di, row.key, { exerciseId: id, status: "auto" });
                        setExpanded(null);
                      }}
                      onOther={() =>
                        setPicker({
                          kind: "row",
                          day: di,
                          key: row.key,
                          // 이름을 받기 전이면 「…」로 검색하지 않게 빈칸(REV-116 U8)
                          query: row.query || (row.exerciseId ? (names.get(row.exerciseId) ?? "") : ""),
                          title: t("routineImport.pickExercise"),
                        })
                      }
                      onPrescription={() => setSheetFor({ day: di, key: row.key })}
                      onMenu={() => setMenuFor({ day: di, key: row.key })}
                      onSeek={
                        renderWatch && review.embeddable && review.videoId && !inAppShell
                          ? (sec) => setWatch({ startSec: sec })
                          : undefined
                      }
                    />
                  ))}
                </ul>
                <button
                  type="button"
                  data-testid="import-add"
                  onClick={() => setPicker({ kind: "add", day: di })}
                  className="mt-[var(--spacing-xs)] min-h-[44px] font-semibold text-(--color-ink) text-[length:var(--text-sm)]"
                >
                  {t("routineImport.addExercise")}
                </button>
              </div>
            ),
          )}

          {review.mentionedOnly.length ? (
            <details className="mt-[var(--spacing-md)]" data-testid="import-mentioned">
              <summary className="min-h-[44px] cursor-pointer py-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]">
                {t("routineImport.mentionedTitle", { count: review.mentionedOnly.length })}
              </summary>
              <AppText variant="caption" color="textFaint" className="block">
                {t("routineImport.mentionedHint")}
              </AppText>
              <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
                {review.mentionedOnly.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    data-testid="import-mentioned-add"
                    onClick={() => addMentioned(m)}
                    className="min-h-[44px] rounded-[var(--radius-pill)] border border-(--color-line-strong) px-[var(--spacing-md)] text-(--color-ink) text-[length:var(--text-sm)]"
                  >
                    {t("routineImport.addMentioned", { name: nameOf(m.exerciseId) })}
                  </button>
                ))}
              </div>
            </details>
          ) : null}

          {error ? (
            <p
              role="alert"
              data-testid="import-error"
              className="mt-[var(--spacing-md)] text-(--color-bad) text-[length:var(--text-sm)]"
            >
              {error}
            </p>
          ) : null}

          <div className="sticky bottom-0 mt-[var(--spacing-lg)] flex gap-[var(--spacing-sm)] bg-(--color-bg) py-[var(--spacing-sm)] pb-[max(var(--spacing-sm),env(safe-area-inset-bottom))]">
            <Button
              title={t("routineImport.restart")}
              variant="quiet"
              fullWidth={false}
              testId="import-restart"
              onPress={() => {
                clearImportDraft();
                setReview(null);
                setError(null);
                setNotice(null);
              }}
            />
            <div className="flex-1">
              <Button
                title={t("routineImport.save")}
                loading={busy}
                testId="import-save"
                onPress={() => void onSave()}
              />
            </div>
          </div>
        </section>
      )}

      {picker ? (
        <ExercisePickerScreen
          mode={picker.kind === "row" ? "single" : "multi"}
          title={picker.kind === "row" ? picker.title : t("routineImport.addExercise")}
          initialQuery={picker.kind === "row" ? picker.query || undefined : undefined}
          onDone={onPicked}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {sheetFor && sheetRow ? (
        <ImportRowSheet
          name={nameOf(sheetRow.exerciseId)}
          value={sheetRow as RowValues}
          onChange={(patch, touched) =>
            patchRow(sheetFor.day, sheetFor.key, {
              ...patch,
              ...(touched.sets ? { setsStated: true } : {}),
              ...(touched.reps ? { repsStated: true } : {}),
            })
          }
          onClose={() => setSheetFor(null)}
        />
      ) : null}

      {menuFor && menuRow ? (
        <SheetShell
          title={nameOf(menuRow.exerciseId)}
          onClose={() => setMenuFor(null)}
          hideOk
          testId="import-row-menu"
        >
          <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-xs)]">
            <Button
              title={t("routineImport.moveUp")}
              variant="secondary"
              icon="chevron-up"
              testId="import-move-up"
              onPress={() => {
                const f = menuFor;
                setMenuFor(null);
                move(f.day, f.key, -1);
              }}
            />
            <Button
              title={t("routineImport.moveDown")}
              variant="secondary"
              icon="chevron-down"
              testId="import-move-down"
              onPress={() => {
                const f = menuFor;
                setMenuFor(null);
                move(f.day, f.key, 1);
              }}
            />
            <Button
              title={t("routineImport.remove")}
              variant="danger"
              icon="trash-outline"
              testId="import-remove"
              onPress={() => {
                const f = menuFor;
                setMenuFor(null);
                remove(f.day, f.key);
              }}
            />
          </div>
        </SheetShell>
      ) : null}

      {confirmSave ? (
        <ConfirmDialog
          testId="import-save-confirm"
          title={t("routineImport.saveConfirmTitle")}
          message={[
            counts.unresolved ? t("routineImport.saveConfirmUnresolved", { count: counts.unresolved }) : "",
            counts.review ? t("routineImport.saveConfirmReview", { count: counts.review }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
          confirmLabel={t("common.save")}
          onCancel={() => setConfirmSave(false)}
          onConfirm={() => void onSave()}
        />
      ) : null}
      {dupe ? (
        <ConfirmDialog
          testId="import-dupe"
          title={t("concept.dupeTitle")}
          message={t("concept.dupeMessage")}
          confirmLabel={t("common.save")}
          onCancel={() => setDupe(false)}
          onConfirm={() => void doSave()}
        />
      ) : null}
      {leaveDialog}
    </div>
  );
}

function DraftSkeleton() {
  return (
    <div
      role="status"
      aria-label={t("routineImport.reading")}
      className="mt-[var(--spacing-md)]"
      data-testid="import-skeleton"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mb-[var(--spacing-xs)] h-[56px] animate-pulse rounded-[var(--radius-md)] bg-(--color-line)"
        />
      ))}
    </div>
  );
}

function RowCard({
  row,
  name,
  names,
  expanded,
  videoId,
  onName,
  onCandidate,
  onOther,
  onPrescription,
  onMenu,
  onSeek,
}: {
  row: Row;
  name: string;
  names: Map<string, string>;
  expanded: boolean;
  videoId: string | null;
  onName: () => void;
  onCandidate: (id: string) => void;
  onOther: () => void;
  onPrescription: () => void;
  onMenu: () => void;
  onSeek?: (sec: number) => void;
}) {
  const unresolved = !row.exerciseId;
  const needs = row.status === "review" && !!row.exerciseId;
  const reps = row.repsMax !== row.repsMin ? `${row.repsMin}~${row.repsMax}` : String(row.repsMin);
  const presc = t("routineImport.prescription", { sets: row.sets, reps });
  const defaulted = !row.setsStated && !row.repsStated;
  return (
    <li
      data-testid="import-row"
      data-status={unresolved ? "none" : row.status}
      data-key={row.key}
      className="px-[var(--spacing-md)] py-[var(--spacing-sm)]"
    >
      <div className="flex items-center gap-[var(--spacing-xs)]">
        <button
          type="button"
          onClick={onName}
          aria-expanded={row.status === "review" && row.candidates.length ? expanded : undefined}
          data-testid="import-row-name"
          className="flex min-h-[44px] flex-1 items-center gap-[var(--spacing-xs)] text-left"
        >
          <span
            className={`font-semibold text-[length:var(--text-md)] ${unresolved ? "text-(--color-ink2) underline decoration-dotted" : "text-(--color-ink)"}`}
          >
            {unresolved
              ? row.query
                ? `${row.query} · ${t("routineImport.pickExercise")}`
                : t("routineImport.pickExercise")
              : name}
          </span>
          {needs ? (
            <span
              data-testid="import-row-needs"
              className="shrink-0 rounded-[var(--radius-pill)] bg-(--color-line) px-[var(--spacing-sm)] py-[2px] text-(--color-ink2) text-[length:var(--text-xs)]"
            >
              {t("routineImport.needsCheck")}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onMenu}
          data-row-menu={row.key}
          data-testid="import-row-menu-btn"
          aria-label={t("routineImport.rowMenu", {
            name: unresolved ? t("routineImport.pickExercise") : name,
          })}
          className="inline-flex h-11 w-11 items-center justify-center"
        >
          <Icon name="ellipsis-horizontal" size={20} color="var(--color-ink2)" />
        </button>
      </div>

      {expanded && row.candidates.length ? (
        <div
          className="mb-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]"
          data-testid="import-candidates"
        >
          {row.candidates.slice(0, 3).map((c) => (
            <button
              key={c}
              type="button"
              data-testid="import-candidate"
              aria-pressed={c === row.exerciseId}
              onClick={() => onCandidate(c)}
              style={{
                backgroundColor: c === row.exerciseId ? "var(--color-surface-alt)" : "var(--color-card)",
                borderColor: c === row.exerciseId ? "var(--color-ink)" : "var(--color-line-strong)",
              }}
              className={`min-h-[44px] rounded-[var(--radius-pill)] border px-[var(--spacing-md)] text-(--color-ink) text-[length:var(--text-sm)] ${c === row.exerciseId ? "font-semibold" : ""}`}
            >
              {c === row.exerciseId ? <span aria-hidden>✓ </span> : null}
              {names.get(c) ?? "…"}
            </button>
          ))}
          <button
            type="button"
            data-testid="import-candidate-other"
            onClick={onOther}
            className="min-h-[44px] px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)] underline"
          >
            {t("routineImport.otherExercise")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-[var(--spacing-xs)]">
        <button
          type="button"
          onClick={onPrescription}
          data-testid="import-row-presc"
          aria-label={`${unresolved ? t("routineImport.pickExercise") : name} ${presc}${row.restSec ? ` ${t("routineImport.rest")} ${t("routineImport.restSec", { sec: row.restSec })}` : ""}${defaulted ? ` ${t("routineImport.notStated")}` : ""}`}
          className="min-h-[44px] rounded-[var(--radius-pill)] border border-(--color-line-strong) px-[var(--spacing-md)] text-(--color-ink) text-[length:var(--text-sm)]"
        >
          {presc}
          {row.restSec ? ` · ${t("routineImport.restSec", { sec: row.restSec })}` : ""}
        </button>
        {defaulted ? (
          <span data-testid="import-row-default" className="text-(--color-ink3) text-[length:var(--text-xs)]">
            {t("routineImport.notStated")}
          </span>
        ) : null}
        {row.atSec != null && videoId ? (
          onSeek ? (
            <button
              type="button"
              data-testid="import-row-seek"
              onClick={() => onSeek(row.atSec as number)}
              aria-label={t("routineImport.seekNamed", { name, time: clock(row.atSec) })}
              className="min-h-[44px] px-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-sm)]"
            >
              ▶ {clock(row.atSec)}
            </button>
          ) : (
            <a
              href={youtubeWatchUrl(videoId, row.atSec)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="import-row-seek"
              aria-label={`${t("routineImport.seekNamed", { name, time: clock(row.atSec) })} ${t("routineImport.newWindow")}`}
              className="inline-flex min-h-[44px] items-center px-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-sm)]"
            >
              ▶ {clock(row.atSec)} ↗
            </a>
          )
        ) : null}
      </div>
      {row.noteKo ? (
        <AppText variant="caption" color="textFaint" className="block">
          {row.noteKo}
        </AppText>
      ) : null}
    </li>
  );
}
