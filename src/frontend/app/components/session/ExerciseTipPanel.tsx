"use client";
// @plm SRS-032  운동 방법 패널 — app의 features/session/ExerciseTipPanel.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 세트를 기록하다 "이 종목 어떻게 하더라?" 할 때 여는 자리. 기본은 접혀 있고, 접힘 상태를
// **종목명 기준으로 기억한다**(앱을 쓰는 동안). 한 번 편 종목은 다음에도 펴진 채로 나온다.
//
// 안에는 두 모드가 번갈아 든다 — 탭할 때마다 바뀐다:
//   media  2컷 교차(또는 3D 움짤) 시연
//   steps  번호 붙은 단계 설명
// 이미지가 없는 종목(설명만 있는 항목)은 steps만 보여 준다.
// ─────────────────────────────────────────────────────────────────────────────
import { getExerciseMedia, hasMediaImages } from "@app/core/data/exerciseMedia";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { lang, t } from "@/lib/i18n";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

/** 종목명 → 펼침 여부. 컴포넌트 밖에 두어 블록이 다시 마운트돼도 남는다(app과 같다). */
const expandedByExercise = new Map<string, boolean>();

export function ExerciseTipPanel({ nameKo, trailing }: { nameKo: string | null; trailing?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"media" | "steps">("media");

  useEffect(() => {
    if (!nameKo) return;
    setExpanded(expandedByExercise.get(nameKo) ?? false);
    setMode("media");
  }, [nameKo]);

  if (!nameKo) return null;
  const media = getExerciseMedia(nameKo);
  const steps = media
    ? lang === "ko" && media.instructionsKo.length
      ? media.instructionsKo
      : media.instructionsEn
    : [];
  if (!media && steps.length === 0) return null;

  const hasImages = hasMediaImages(media);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    expandedByExercise.set(nameKo, next);
    if (next) setMode(hasImages ? "media" : "steps");
  };

  return (
    <div className="mt-[var(--spacing-xs)]">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="tip-toggle"
          onClick={toggle}
          className="flex items-center gap-[4px] self-start py-[2px]"
        >
          <Icon name="film-outline" size={14} color="var(--color-ink2)" />
          <AppText variant="label" color="textMuted">
            {t("session.tipToggle")}
          </AppText>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} color="var(--color-ink2)" />
        </button>
        {trailing}
      </div>

      {expanded && mode === "media" && media && hasImages ? (
        <button
          type="button"
          data-testid="tip-media"
          onClick={() => steps.length && setMode("steps")}
          className="mt-[var(--spacing-xs)] block w-full"
        >
          <TwoFrameLoop start={media.start} end={media.end} gif={media.gif} />
          {steps.length ? (
            <AppText variant="label" color="textFaint" center className="mt-[2px] block">
              {t("session.tipTapForSteps")}
            </AppText>
          ) : null}
        </button>
      ) : expanded ? (
        <button
          type="button"
          data-testid="tip-steps"
          onClick={() => hasImages && setMode("media")}
          className="mt-[var(--spacing-xs)] flex w-full flex-col gap-[var(--spacing-xs)] rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[var(--spacing-sm)] text-left"
        >
          {steps.map((s, i) => (
            <span key={s} className="flex items-start gap-[var(--spacing-sm)]">
              <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--radius-pill)] bg-(--color-brand-muted)">
                <AppText variant="label" color="primary" className="font-bold">
                  {String(i + 1)}
                </AppText>
              </span>
              <AppText variant="caption" color="textMuted" className="flex-1">
                {s}
              </AppText>
            </span>
          ))}
          {hasImages ? (
            <AppText variant="label" color="textFaint" center className="block">
              {t("session.tipTapForMedia")}
            </AppText>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}

/**
 * 2컷 교차 시연 — 1100ms마다 시작/끝 프레임을 바꾼다.
 *
 * 두 장을 겹쳐 두고 투명도만 토글하므로 다시 받아오지 않는다. 3D 움짤이 있으면 브라우저가
 * 알아서 루프하므로 그걸 그대로 쓴다(SRS-046).
 */
function TwoFrameLoop({ start, end, gif }: { start: string | null; end: string | null; gif: string | null }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (gif) return;
    const iv = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1100);
    return () => clearInterval(iv);
  }, [gif]);

  if (gif) {
    return (
      <span className="block h-[150px] w-full overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface-alt)">
        {/* biome-ignore lint/performance/noImgElement: 자체 호스팅 움짤 — 최적화 서버가 필요 없다 */}
        <img src={gif} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }
  if (!start || !end) return null;

  return (
    <span className="relative block h-[150px] w-full overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface-alt)">
      {/* biome-ignore lint/performance/noImgElement: 외부 CDN 자세 사진 */}
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
    </span>
  );
}
