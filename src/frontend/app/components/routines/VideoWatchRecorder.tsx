"use client";
// 영상 보며 받아 적기(SPEC-054 Phase 4 · SRS-116 ④) — 확인 화면 위에 덮는 전체 화면.
//
// - 플레이어는 위에 sticky(16:9 · 좌우 여백 없이) · 줄 목록만 스크롤 · 하단 고정 바의 「+ 종목」이 이 화면의 유일한 강조색.
// - 임베드 = youtube-nocookie + 공식 IFrame API(이 화면에서만 지연 로드). 플레이어 시각을 읽어 빈 줄에 남긴다.
// - 임베드 불가(서버 embeddable=false · onError 2/5/100/101/150/153 · 8초 안에 준비 안 됨 · 앱 껍데기) → 새 창 링크 + 시각 없는 줄.
//   앱(iOS·안드로이드)은 WebView 의 iframe 이동이 바깥 앱으로 튈 수 있어 실기기 확인 전까지 새 창(REV-117 Y4 · 스펙은 iOS 만).
// - 플레이어를 가리는 창(선택 창·처방 시트)을 열 때는 늘 멈추고, 닫을 때 원래 재생 중이었으면 다시 재생(YouTube 정책 — 재생 중 가림 금지 · Y1).
// - history 칸은 따로 쌓지 않는다 — 확인 화면의 나가기 가드 칸을 함께 쓰고, 뒤로 = 확인 화면으로(RoutineImport 의 onPop).
// - 원문·제목·채널은 저장하지 않는다(줄은 부르는 쪽 상태 · 초안 보존은 lib/importDraft 의 정해진 칸만).
import { youtubeWatchUrl } from "@app/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { appVersionOf, isIOSAppUA } from "@/lib/platform";
import ExercisePickerScreen, { type Pick } from "../ExercisePickerScreen";
import { Button } from "../ui/Button";
import { AppText } from "../ui/primitives";
import ImportRowSheet, { type RowValues } from "./ImportRowSheet";
import { blankRow, clock, type Review, type Row } from "./RoutineImport";

/** 플레이어 준비 한도 — 넘으면 임베드 불가로 본다(스펙: 8초) */
export const EMBED_READY_MS = 8_000;
// [원본] new Set([101, 150, 153]) — 100(없음·비공개)·2·5 는 검은 화면에 남았다(REV-117 W7·Y9)
const EMBED_ERRORS = new Set([2, 5, 100, 101, 150, 153]);
const API_SRC = "https://www.youtube.com/iframe_api";

// 공식 IFrame API 의 쓰는 부분만
interface YTPlayer {
  getCurrentTime(): number;
  seekTo(sec: number, allowSeekAhead: boolean): void;
  pauseVideo(): void;
  playVideo(): void;
  getPlayerState(): number;
  getIframe?(): HTMLIFrameElement;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
let apiScript: HTMLScriptElement | null = null;
/** 준비 한도를 넘긴 로드는 버린다 — 다음에 열 때 다시 시도(위젯 스크립트가 막혀 영영 대기하던 것 · REV-117 W6) */
function resetApi() {
  if (window.YT?.Player) return;
  apiPromise = null;
  apiScript?.remove();
  apiScript = null;
}
/** IFrame API 를 한 번만 불러온다 — 실패하면 다음 번에 다시 시도할 수 있게 비운다 */
function loadApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YT missing"));
    };
    const s = document.createElement("script");
    s.src = API_SRC;
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      apiScript = null;
      s.remove();
      reject(new Error("iframe_api load failed"));
    };
    apiScript = s;
    document.head.appendChild(s);
  });
  return apiPromise;
}

export interface WatchProps {
  review: Review;
  startSec: number | null;
  nameOf: (id: string | null) => string;
  /** 확인 화면 상태를 함수형으로 고친다(줄 더하기·고치기) */
  update: (fn: (r: Review) => Review) => void;
  /** 확인 화면으로 */
  onBack: () => void;
}

export default function VideoWatchRecorder({ review, startSec, nameOf, update, onBack }: WatchProps) {
  const videoId = review.videoId as string;
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const iosApp = isIOSAppUA(ua);
  const inApp = iosApp || appVersionOf(ua) != null;
  const [failed, setFailed] = useState<boolean>(!review.embeddable || inApp);
  const [quickPick, setQuickPick] = useState(false);
  // [원본] 「고르는 동안 잠깐 멈춤」 토글 — 끄면 재생 중 선택 창이 플레이어를 가렸다(Y1) → 늘 멈춤
  const [picker, setPicker] = useState<{ key: string } | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const resumeRef = useRef(false);
  const [live, setLive] = useState("");
  const listEnd = useRef<HTMLLIElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  // 마지막(저장 안 한) 날에 적는다 · 여러 날이면 위에 그 날 이름(W11)
  const day = (() => {
    for (let k = review.days.length - 1; k >= 0; k--) if (!review.days[k].saved) return k;
    return Math.max(0, review.days.length - 1);
  })();

  // 첫 시각·제목은 열 때 한 번만 쓴다(바뀌어도 플레이어를 다시 만들지 않게)
  const openRef = useRef({ startSec, title: review.title });
  // 플레이어 — 임베드 가능할 때만. 준비 한도 · 오류 코드 → 대체 화면
  useEffect(() => {
    if (failed) return;
    let gone = false;
    const timer = window.setTimeout(() => {
      if (!gone && !readyOnce) {
        resetApi();
        setFailed(true);
      }
    }, EMBED_READY_MS);
    let readyOnce = false;
    loadApi()
      .then((YT) => {
        if (gone || !hostRef.current) return;
        const mount = document.createElement("div");
        hostRef.current.replaceChildren(mount);
        const p = new YT.Player(mount, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            ...(openRef.current.startSec != null ? { start: Math.floor(openRef.current.startSec) } : {}),
          },
          events: {
            onReady: () => {
              if (gone) return;
              readyOnce = true;
              window.clearTimeout(timer);
              playerRef.current = p;
              setReady(true);
            },
            onError: (e) => {
              if (gone) return;
              if (EMBED_ERRORS.has(e.data)) setFailed(true);
            },
          },
        });
        // 제목은 만들자마자(준비 전 8초 동안 이름 없는 iframe 이 되지 않게 · Y8)
        try {
          p.getIframe?.()?.setAttribute(
            "title",
            openRef.current.title
              ? t("routineImport.playerTitle", { title: openRef.current.title })
              : t("routineImport.playerTitleNone"),
          );
        } catch {
          /* 아직 iframe 이 없다 */
        }
        cleanupRef.current = () => {
          try {
            p.destroy();
          } catch {
            /* 이미 없어짐 */
          }
        };
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      window.clearTimeout(timer);
      cleanupRef.current?.();
      cleanupRef.current = null;
      playerRef.current = null;
    };
  }, [videoId, failed]);

  const now = useCallback((): number | null => {
    if (failed) return null;
    const p = playerRef.current;
    // 준비 전 — 「▶ m:ss」로 열었으면 그 시각(W8)
    if (!p) return openRef.current.startSec != null ? Math.floor(openRef.current.startSec) : null;
    try {
      const s = p.getCurrentTime();
      return Number.isFinite(s) ? Math.max(0, Math.floor(s)) : null;
    } catch {
      return null;
    }
  }, [failed]);

  /** 같은 문구가 이어져도 다시 읽히게(W10·Y7) */
  const announce = (msg: string) => {
    setLive("");
    requestAnimationFrame(() => setLive(msg));
  };
  /** 플레이어를 가리는 창을 열기 전 — 재생 중(1)·버퍼링(3)이었으면 닫을 때 다시 재생(Y1·W9) */
  const pauseForOverlay = () => {
    resumeRef.current = false;
    const pl = playerRef.current;
    if (!pl) return;
    try {
      const st = pl.getPlayerState();
      resumeRef.current = st === 1 || st === 3;
      pl.pauseVideo();
    } catch {
      resumeRef.current = false;
    }
  };
  const resumeAfterOverlay = () => {
    if (!resumeRef.current) return;
    resumeRef.current = false;
    try {
      playerRef.current?.playVideo();
    } catch {
      /* 플레이어가 없어졌으면 그대로 */
    }
  };
  const openPicker = (key: string) => {
    pauseForOverlay();
    setPicker({ key });
  };
  const openSheet = (key: string) => {
    pauseForOverlay();
    setSheetKey(key);
  };

  const addRow = () => {
    const at = now();
    const row: Row = { ...blankRow(at), from: "watch" };
    update((r) => ({
      ...r,
      // 받아 적기로 줄을 더하면 「읽은 곳」에 받아 적기(W11)
      sources: r.sources.includes("watch") ? r.sources : [...r.sources, "watch"],
      days: r.days.map((d, k) => (k === day ? { ...d, items: [...d.items, row] } : d)),
    }));
    announce(
      at != null ? t("routineImport.watchAdded", { time: clock(at) }) : t("routineImport.watchAddedNoTime"),
    );
    // 바로 고르기 — 취소해도 줄(시각)은 남는다: 종목은 나중에 그 줄을 눌러 고른다
    if (quickPick) openPicker(row.key);
    // 새 줄이 보이게
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ block: "nearest" }));
  };

  const patch = (key: string, p: Partial<Row>) =>
    update((r) => ({
      ...r,
      days: r.days.map((d) => ({ ...d, items: d.items.map((x) => (x.key === key ? { ...x, ...p } : x)) })),
    }));

  const closePicker = () => {
    setPicker(null);
    resumeAfterOverlay();
  };
  const closeSheet = () => {
    setSheetKey(null);
    resumeAfterOverlay();
  };

  // 덮개 — 열 때 「+ 종목」으로 포커스 · Esc = 확인 화면으로 · Tab 은 덮개 안에서(Y5·W12)
  useEffect(() => {
    addRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (picker || sheetKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onBack();
      return;
    }
    if (e.key !== "Tab" || !rootRef.current) return;
    const items = [
      ...rootRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const onPicked = (picks: Pick[]) => {
    const p = picker;
    if (p && picks.length) patch(p.key, { exerciseId: picks[0].exerciseId, status: "auto", candidates: [] });
    closePicker();
  };

  const seek = (sec: number) => {
    try {
      playerRef.current?.seekTo(sec, true);
      playerRef.current?.playVideo();
    } catch {
      /* 준비 전 */
    }
  };

  const rows = review.days[day]?.items ?? [];
  const sheetRow = sheetKey ? rows.find((x) => x.key === sheetKey) : null;

  return (
    <div
      ref={rootRef}
      data-testid="watch-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[44] flex flex-col bg-(--color-bg)"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <h1 id="watch-title" className="sr-only">
        {t("routineImport.watchInstead")}
      </h1>
      <p aria-live="polite" className="sr-only" data-testid="watch-live">
        {live}
      </p>
      <div className="mx-auto flex min-h-0 w-full max-w-[640px] flex-1 flex-col">
        {/* 플레이어 — sticky 위 · 16:9 · 좌우 여백 없음 */}
        <div
          className="relative w-full shrink-0 bg-black"
          // 좁은 화면(폭 356 미만)에서도 200×200 이상 — 16:9 를 깨고 위아래 검은 띠(YouTube 최소 크기 · Y2)
          style={{ aspectRatio: "16 / 9", minHeight: 200 }}
          data-testid="watch-player"
          data-ready={ready ? "1" : "0"}
        >
          {failed ? (
            <div
              data-testid="watch-fallback"
              className="absolute inset-0 flex flex-col items-center justify-center gap-[var(--spacing-sm)] bg-(--color-card) p-[var(--spacing-md)] text-center"
            >
              <AppText variant="body" className="block">
                {inApp ? t("routineImport.watchIosApp") : t("routineImport.watchCantEmbed")}
              </AppText>
              <a
                href={youtubeWatchUrl(videoId, startSec ?? undefined)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="watch-open-youtube"
                className="inline-flex min-h-[44px] items-center px-[var(--spacing-md)] text-(--color-ink) text-[length:var(--text-sm)] underline"
              >
                {t("routineImport.openOnYoutube")}
                <span className="sr-only"> {t("routineImport.newWindow")}</span>
              </a>
              <AppText variant="caption" color="textMuted" className="block">
                {t("routineImport.watchNoTimeHint")}
              </AppText>
            </div>
          ) : (
            <>
              <div ref={hostRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
              {!ready ? (
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                  <AppText variant="caption" className="text-white">
                    {t("routineImport.watchLoading")}
                  </AppText>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* 줄 목록 — 이것만 스크롤 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[var(--spacing-md)]">
          {review.days.length > 1 ? (
            <AppText
              variant="label"
              color="textMuted"
              className="block pt-[var(--spacing-xs)]"
              data-testid="watch-day"
            >
              {review.days[day]?.name || t("routineImport.dayLabel", { n: day + 1 })}
            </AppText>
          ) : null}
          {rows.length ? (
            <ul className="divide-y divide-(--color-line)" data-testid="watch-rows">
              {rows.map((r, i) => (
                <li
                  key={r.key}
                  ref={i === rows.length - 1 ? listEnd : undefined}
                  data-testid="watch-row"
                  className="flex min-h-[52px] items-center gap-[var(--spacing-xs)] py-[var(--spacing-xs)]"
                >
                  {r.atSec != null && !failed ? (
                    <button
                      type="button"
                      data-testid="watch-row-seek"
                      onClick={() => seek(r.atSec as number)}
                      aria-label={t("routineImport.seekNamed", {
                        name: r.exerciseId ? nameOf(r.exerciseId) : t("routineImport.pickExercise"),
                        time: clock(r.atSec),
                      })}
                      className="min-h-[44px] min-w-[56px] shrink-0 text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
                    >
                      ▶ {clock(r.atSec)}
                    </button>
                  ) : r.atSec != null ? (
                    <span className="min-w-[56px] shrink-0 text-(--color-ink3) text-[length:var(--text-sm)] tabular-nums">
                      ⏱ {clock(r.atSec)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="watch-row-name"
                    aria-label={t("routineImport.watchRowName", {
                      n: i + 1,
                      name: r.exerciseId ? nameOf(r.exerciseId) : t("routineImport.pickExercise"),
                    })}
                    onClick={() => openPicker(r.key)}
                    className={`min-h-[44px] min-w-0 flex-1 truncate text-left text-[length:var(--text-md)] ${
                      r.exerciseId ? "text-(--color-ink)" : "text-(--color-ink2) underline decoration-dotted"
                    }`}
                  >
                    {r.exerciseId ? nameOf(r.exerciseId) : t("routineImport.pickExercise")}
                  </button>
                  <button
                    type="button"
                    data-testid="watch-row-presc"
                    aria-label={`${t("routineImport.watchRowN", { n: i + 1 })} ${t(
                      "routineImport.prescription",
                      {
                        sets: r.sets,
                        reps: r.repsMin === r.repsMax ? String(r.repsMin) : `${r.repsMin}~${r.repsMax}`,
                      },
                    )}`}
                    onClick={() => openSheet(r.key)}
                    className="min-h-[44px] shrink-0 rounded-[var(--radius-pill)] border border-(--color-line-strong) px-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-sm)]"
                  >
                    {t("routineImport.prescription", {
                      sets: r.sets,
                      reps: r.repsMin === r.repsMax ? String(r.repsMin) : `${r.repsMin}~${r.repsMax}`,
                    })}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <AppText variant="caption" color="textMuted" className="block py-[var(--spacing-md)]">
              {t("routineImport.watchEmpty")}
            </AppText>
          )}
          <div className="flex flex-wrap gap-x-[var(--spacing-md)] py-[var(--spacing-sm)]">
            <label className="flex min-h-[44px] items-center gap-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-sm)]">
              <input
                type="checkbox"
                data-testid="watch-quick-pick"
                checked={quickPick}
                onChange={(e) => setQuickPick(e.target.checked)}
                className="h-5 w-5"
              />
              {t("routineImport.quickPick")}
            </label>
          </div>
        </div>

        {/* 하단 고정 바 — 「+ 종목」이 유일한 강조색 · 확인 화면으로 돌아가서 저장 */}
        <div
          className="flex shrink-0 gap-[var(--spacing-sm)] border-(--color-line) border-t bg-(--color-surface) px-[var(--spacing-md)] pt-[var(--spacing-sm)]"
          style={{ paddingBottom: "calc(var(--spacing-sm) + env(safe-area-inset-bottom))" }}
        >
          <div className="flex-1">
            <Button
              title={t("routineImport.watchDone")}
              variant="secondary"
              testId="watch-done"
              onPress={onBack}
            />
          </div>
          <div className="flex-[2]" ref={addRef}>
            <Button title={t("routineImport.watchAdd")} testId="watch-add" onPress={addRow} />
          </div>
        </div>
      </div>

      {picker ? (
        <ExercisePickerScreen
          mode="single"
          title={t("routineImport.pickExercise")}
          onDone={onPicked}
          onClose={closePicker}
        />
      ) : null}
      {sheetRow ? (
        <ImportRowSheet
          name={sheetRow.exerciseId ? nameOf(sheetRow.exerciseId) : t("routineImport.pickExercise")}
          value={sheetRow as RowValues}
          onChange={(p, touched) =>
            patch(sheetRow.key, {
              ...p,
              ...(touched.sets ? { setsStated: true } : {}),
              ...(touched.reps ? { repsStated: true } : {}),
            })
          }
          onClose={closeSheet}
        />
      ) : null}
    </div>
  );
}
