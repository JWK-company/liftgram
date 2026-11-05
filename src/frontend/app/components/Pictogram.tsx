"use client";
// @plm SRS-055  종목 픽토그램 — 목록 썸네일(정지) · 상세·운동 중 팁(시작↔끝 움직임) (ADR-036)
//
// ─────────────────────────────────────────────────────────────────────────────
// 그림은 core 의 리그가 SVG 문자열로 만든다(자체 제작 · 네트워크 없음 · 오프라인 그대로).
// 리그·자세 데이터·카탈로그 표는 처음 그림이 필요할 때 한 번만 불러온다 — 첫 화면 JS 를 늘리지 않는다.
// 색은 SVG 안의 CSS 변수가 앱 토큰을 따라가므로 라이트·다크가 저절로 맞는다.
//
// 움직임은 프레임 몇 장을 앞뒤로 돌린다(시작 → 끝 → 시작). 「동작 줄이기」 설정이면 대표 자세 한 장만.
// 그림이 없는 종목(내가 만든 종목 등)은 fallback 을 그린다.
// ─────────────────────────────────────────────────────────────────────────────
import { type ReactNode, useEffect, useState } from "react";
import { motionThumbUrl } from "@/lib/motionCache";

type Mod = typeof import("@app/core/data/pictograms/render");
let modPromise: Promise<Mod> | null = null;
const load = () => {
  modPromise ??= import("@app/core/data/pictograms/render");
  return modPromise;
};

/** 같은 종목의 그림을 다시 만들지 않는다(목록을 스크롤해도 한 번). */
const stillCache = new Map<string, string | null>();
const framesCache = new Map<string, string[] | null>();

const FRAME_MS = 110;
const HOLD_FRAMES = 5;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function Pictogram({
  exerciseId,
  animate = false,
  className = "",
  fallback = null,
  thumbnail = true,
  testId,
}: {
  exerciseId: string;
  animate?: boolean;
  className?: string;
  fallback?: ReactNode;
  /** 영상이 있는 종목은 정지 사진을 겹친다. 영상 아래 깔린 그림은 끈다. */
  thumbnail?: boolean;
  testId?: string;
}) {
  const key = exerciseId;
  const [still, setStill] = useState<string | null | undefined>(() =>
    stillCache.get(animate ? `${key}:full` : key),
  );
  const [frames, setFrames] = useState<string[] | null | undefined>(() => framesCache.get(key));
  const [i, setI] = useState(0);
  const moving = animate && !reducedMotion();
  // SPEC-034 목록 썸네일 — 영상이 있는 종목은 정지 사진. 못 받으면 픽토그램 그대로.
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbReady, setThumbReady] = useState(false);
  useEffect(() => {
    setThumb(null);
    setThumbReady(false);
    if (animate || !thumbnail) return;
    let cancelled = false;
    void import("@app/core/data/exerciseMotion.data").then((m) => {
      const clip = m.EXERCISE_MOTION[key];
      if (!cancelled && clip) setThumb(clip);
    });
    return () => {
      cancelled = true;
    };
  }, [key, animate, thumbnail]);

  useEffect(() => {
    let cancelled = false;
    void load().then((m) => {
      if (cancelled) return;
      const spec = m.specForId(key);
      if (!stillCache.has(key)) stillCache.set(key, spec ? m.pictogramSvg(spec) : null);
      // 움직임 자리(상세·팁)의 정지 그림은 움직임과 같은 창 — 동작 줄이기에서도 크기가 같다
      if (animate && spec && !stillCache.has(`${key}:full`))
        stillCache.set(`${key}:full`, m.pictogramSvg(spec, "end"));
      if (animate) setStill(stillCache.get(`${key}:full`) ?? null);
      else setStill(stillCache.get(key) ?? null);
      if (animate) {
        if (!framesCache.has(key)) framesCache.set(key, spec ? m.pictogramFrames(spec, 6) : null);
        setFrames(framesCache.get(key) ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, animate]);

  // 앞뒤로 돌린다 — 양 끝에서 잠깐 멈춘다(시작 자세·끝 자세가 눈에 남게).
  useEffect(() => {
    if (!moving || !frames || frames.length < 2) return;
    const n = frames.length;
    const cycle = (n - 1) * 2 + HOLD_FRAMES * 2;
    let step = 0;
    const iv = setInterval(() => {
      step = (step + 1) % cycle;
      const s = step;
      let idx: number;
      if (s < HOLD_FRAMES) idx = 0;
      else if (s < HOLD_FRAMES + (n - 1)) idx = s - HOLD_FRAMES + 1;
      else if (s < HOLD_FRAMES * 2 + (n - 1)) idx = n - 1;
      else idx = n - 1 - (s - (HOLD_FRAMES * 2 + (n - 1)) + 1);
      setI(Math.max(0, Math.min(n - 1, idx)));
    }, FRAME_MS);
    return () => clearInterval(iv);
  }, [moving, frames]);

  // 사진은 그림 위에 겹쳐, 다 받은 뒤에 보인다 — 느린 망·오프라인에서도 칸이 비지 않는다.
  const photo = thumb ? (
    // biome-ignore lint/performance/noImgElement: 해시 이름 정적 파일 — 이미지 최적화 서버를 거치지 않는다
    <img
      src={motionThumbUrl(thumb)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={`absolute inset-0 h-full w-full object-cover ${thumbReady ? "opacity-100" : "opacity-0"}`}
      onLoad={() => setThumbReady(true)}
      onError={() => setThumb(null)}
    />
  ) : null;
  if (still === null && !photo) return <>{fallback}</>;
  const svg = moving && frames ? frames[i] : still;
  if (!svg) {
    // 불러오는 중 — 자리만 잡아 둔다(줄 높이가 흔들리지 않게)
    return <span className={className} data-testid={testId} aria-hidden="true" />;
  }
  if (photo) {
    return (
      <span
        className={`relative block ${className}`}
        data-testid={testId}
        data-picto={key}
        aria-hidden="true"
      >
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 자체 생성 SVG(외부 입력 없음) */}
        {svg ? <span className="block h-full w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        {photo}
      </span>
    );
  }
  return (
    <span
      className={`block ${className}`}
      data-testid={testId}
      data-picto={key}
      aria-hidden="true"
      // 그림은 core 리그가 숫자로만 만든 SVG 다 — 사용자 입력이 한 글자도 들어가지 않는다.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 자체 생성 SVG(외부 입력 없음)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
