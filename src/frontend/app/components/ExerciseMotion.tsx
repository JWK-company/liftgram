"use client";
// SPEC-034 운동 영상 — 3D 렌더 + AI 보정 영상. 픽토그램을 먼저 그리고, 영상이 실제로 재생되면 그 위를 덮는다.
//
// 영상이 없거나(제외 종목·내가 만든 종목) 재생에 실패하거나 「동작 줄이기」면 픽토그램 그대로다.
// 매핑 표는 처음 필요할 때 불러온다 — 첫 화면 JS 를 늘리지 않는다.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { forgetMotion, motionSource, motionVideoUrl } from "@/lib/motionCache";
import { Pictogram } from "./Pictogram";

type Mod = typeof import("@app/core/data/exerciseMotion.data");
let modPromise: Promise<Mod> | null = null;
export const loadMotionMap = () => {
  modPromise ??= import("@app/core/data/exerciseMotion.data");
  return modPromise;
};

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  try {
    const m = window.matchMedia(QUERY);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  } catch {
    return () => {};
  }
}
const reducedNow = () => {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
};

/** 동시에 재생하는 영상 수 — 긴 목록·낮은 사양에서 디코더가 모자라지 않게. */
const MAX_PLAYING = 2;
const playing = new Set<HTMLVideoElement>();
/** 자리를 내주고 멈춘 영상 — 자리가 나면 다시 튼다. */
const waiting = new Set<HTMLVideoElement>();
function claim(v: HTMLVideoElement) {
  waiting.delete(v);
  while (playing.size >= MAX_PLAYING && !playing.has(v)) {
    const first = playing.values().next().value as HTMLVideoElement | undefined;
    if (!first) break;
    first.pause();
    playing.delete(first);
    waiting.add(first);
  }
  playing.add(v);
}
function release(v: HTMLVideoElement) {
  playing.delete(v);
  waiting.delete(v);
  const next = [...waiting].pop();
  if (next && playing.size < MAX_PLAYING) {
    claim(next);
    void next.play().catch(() => {});
  }
}
// 앱이 백그라운드에서 돌아오면 멈춘 영상을 다시 튼다(iOS 는 스스로 재개하지 않는다).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") for (const v of playing) void v.play().catch(() => {});
  });
}

/** 지금 영상이 실제로 보이는 종목 — 고지는 영상이 보일 때만 낸다. */
const shownIds = new Map<string, number>();
const shownSubs = new Set<() => void>();
function markShown(id: string, on: boolean) {
  const n = (shownIds.get(id) ?? 0) + (on ? 1 : -1);
  if (n > 0) shownIds.set(id, n);
  else shownIds.delete(id);
  for (const f of shownSubs) f();
}
export function useMotionShown(id: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      shownSubs.add(cb);
      return () => shownSubs.delete(cb);
    },
    () => shownIds.has(id),
    () => false,
  );
}

export function ExerciseMotion({
  exerciseId,
  className = "",
  testId,
}: {
  exerciseId: string;
  className?: string;
  testId?: string;
}) {
  const reduced = useSyncExternalStore(subscribeMotion, reducedNow, () => false);
  const [clip, setClip] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    setClip(null);
    void loadMotionMap().then((m) => {
      if (!cancelled) setClip(m.EXERCISE_MOTION[exerciseId] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  // 화면에 들어왔을 때만 받는다.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const want = !!clip && !reduced && visible;
  useEffect(() => {
    if (!want || !clip) return;
    const ctl = new AbortController();
    let url: string | null = null;
    let done = false;
    void motionSource(clip, ctl.signal)
      .then((u) => {
        if (done) {
          if (u.startsWith("blob:")) URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setSrc(u);
      })
      .catch(() => {
        /* 받기를 취소했을 때 — 픽토그램 그대로 */
      });
    return () => {
      done = true;
      ctl.abort();
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
      setSrc(null);
      setShown(false);
    };
  }, [want, clip]);

  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    claim(v);
    void v.play().catch(() => {
      /* 자동 재생이 막히면 픽토그램 그대로 */
    });
    return () => release(v);
  }, [src]);

  useEffect(() => {
    if (!shown) return;
    markShown(exerciseId, true);
    return () => markShown(exerciseId, false);
  }, [shown, exerciseId]);

  return (
    <div ref={box} className={`relative ${className}`} data-testid={testId} data-motion={clip ?? undefined}>
      <Pictogram
        exerciseId={exerciseId}
        animate={!shown}
        thumbnail={false}
        className="h-full w-full"
        testId={testId ? `${testId}-picto` : undefined}
      />
      {src ? (
        // biome-ignore lint/a11y/useMediaCaption: 소리 없는 동작 시연 영상
        <video
          ref={video}
          src={src}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          data-testid={testId ? `${testId}-video` : undefined}
          onPlaying={() => setShown(true)}
          onError={() => {
            setShown(false);
            // 저장본이 망가졌으면 지우고 파일 주소로 한 번 더. 그것도 실패하면 픽토그램.
            if (clip && src.startsWith("blob:")) {
              void forgetMotion(clip);
              setSrc(motionVideoUrl(clip));
            } else {
              setSrc(null);
            }
          }}
          className={`absolute inset-0 h-full w-full bg-[#f8f8f6] object-contain transition-opacity duration-150 ${shown ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}
