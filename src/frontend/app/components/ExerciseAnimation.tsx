"use client";
// @plm SRS-032  자세 시연 — app의 ExerciseDetailScreen 안 ExerciseAnimation을 웹으로
//
// 무료·합법 GIF가 없어 app은 **시작/끝 2컷을 교차**해 움짤 효과를 낸다('가난한 자의 움짤').
// 두 장을 겹쳐 두고 opacity만 토글하므로 재로드가 없다 — 그 방식 그대로 옮겼다.
// 3D 움짤(자체 호스팅)이 있는 종목은 브라우저가 알아서 루프하므로 단일 이미지로 끝난다(SRS-046).
//
// 탭하면 정지/재생한다(자세를 오래 들여다볼 때).
import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";

export default function ExerciseAnimation({
  start,
  end,
  gif,
}: {
  start: string | null;
  end: string | null;
  gif: string | null;
}) {
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || gif) return;
    const iv = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1100);
    return () => clearInterval(iv);
  }, [paused, gif]);

  if (gif) {
    return (
      <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface-alt)">
        {/* biome-ignore lint/performance/noImgElement: 자체 호스팅·CDN 원본 — 최적화 파이프라인이 필요 없다 */}
        <img src={gif} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }

  if (!start || !end) return null;

  return (
    <button
      type="button"
      data-testid="exercise-animation"
      aria-label={paused ? "시연 재생" : "시연 정지"}
      onClick={() => setPaused((p) => !p)}
      className="relative flex h-[220px] w-full items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface-alt)"
    >
      {/* biome-ignore lint/performance/noImgElement: 외부 CDN 자세 사진 — next/image 최적화 서버가 필요 없다 */}
      <img
        src={start}
        alt=""
        style={{ opacity: frame === 0 ? 1 : 0 }}
        className="absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
      />
      {/* biome-ignore lint/performance/noImgElement: 위와 같다 */}
      <img
        src={end}
        alt=""
        style={{ opacity: frame === 1 ? 1 : 0 }}
        className="absolute inset-0 h-full w-full object-contain transition-opacity duration-200"
      />
      {paused ? (
        <span className="absolute right-[var(--spacing-sm)] bottom-[var(--spacing-sm)] rounded-[var(--radius-pill)] bg-black/60 p-[var(--spacing-xs)]">
          <Icon name="play" size={16} color="var(--color-ink)" />
        </span>
      ) : null}
    </button>
  );
}
