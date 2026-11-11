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
// import { getExerciseMedia } from "@app/core/data/exerciseMedia"; // [원본] P5 에서 getExerciseMediaOwn 으로
import type { ExerciseMedia } from "@app/core/data/exerciseMedia";
import { exerciseCautionOf } from "@app/core/domain/exerciseCautions";
import { hasPictogram } from "@app/core/data/exerciseVisual";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { lang, t } from "@/lib/i18n";
// [원본] import { Pictogram } from "../Pictogram";
import { ExerciseMotion } from "../ExerciseMotion";
import { MotionNotice } from "../MotionNotice";
// [원본] import { Icon } from "../ui/Icon"; — 필름·꺾쇠 아이콘은 MetaAction 이 그린다(REV-130)
import { MetaAction } from "../ui/quiet";
import { ValueChip } from "../ui/ValueChip";
import { AppText } from "../ui/primitives";

/** 종목 id → 펼침 여부. 컴포넌트 밖에 두어 블록이 다시 마운트돼도 남는다(app과 같다). */
const expandedByExercise = new Map<string, boolean>();

// P2(ADR-033): 이름이 아니라 종목 id 로 찾는다 — 대표 이름·별칭이 바뀌어도 팁이 끊기지 않는다.
export function ExerciseTipPanel({
  exerciseId,
  blockId,
  trailing,
}: {
  exerciseId: string | null;
  /** 펼친 내용의 id 를 블록마다 다르게 — 같은 종목 블록이 둘이어도 aria-controls 가 겹치지 않는다(REV-130) */
  blockId?: string;
  trailing?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"media" | "steps">("media");
  const [loadedMedia, setLoadedMedia] = useState<{ id: string; media: ExerciseMedia | null } | null>(null);

  useEffect(() => {
    if (!exerciseId || !expanded) return;
    let cancelled = false;
    void import("@app/core/data/exerciseMedia").then((m) => {
      if (!cancelled) setLoadedMedia({ id: exerciseId, media: m.getExerciseMediaOwn(exerciseId) });
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseId, expanded]);

  useEffect(() => {
    if (!exerciseId) return;
    setExpanded(expandedByExercise.get(exerciseId) ?? false);
    setMode("media");
  }, [exerciseId]);

  // [원본] if (!exerciseId) return null; — 그림이 없어도 옆 버튼(trailing)은 남긴다(REV-130 방어)
  const trailingOnly = trailing ? <div className="mt-[var(--spacing-xs)] flex">{trailing}</div> : null;
  if (!exerciseId) return trailingOnly;
  const bodyId = `tip-body-${blockId ?? exerciseId}`;
  // [원본] const media = getExerciseMedia(exerciseId);
  // [P5] 같은 동작·같은 기구 사진만(빌린 사진은 비운다) + 시드 종목은 픽토그램 움직임(ADR-036) @plm SRS-055
  // 사진·설명 표(672KB)는 처음 펼칠 때 불러온다 — 운동 화면 첫 로드에 싣지 않는다.
  const media = loadedMedia?.id === exerciseId ? loadedMedia.media : null;
  const picto = hasPictogram(exerciseId);
  const caution = exerciseCautionOf(exerciseId);
  const steps = media
    ? lang === "ko" && media.instructionsKo.length
      ? media.instructionsKo
      : media.instructionsEn
    : [];
  // [원본] if (!picto && !media && steps.length === 0) return null;
  if (!picto && !media && steps.length === 0) return trailingOnly;

  // [원본] const hasImages = hasMediaImages(media);
  const hasImages = picto || !!(media && (media.gif || media.start));

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    expandedByExercise.set(exerciseId, next);
    if (next) setMode(hasImages ? "media" : "steps");
  };

  return (
    <div className="mt-[var(--spacing-xs)]">
      {/* [원본] flex items-center justify-between — 좁은 폭에서 「운동 방법 보기」가 두 줄로 꺾였다(화면 정리 P1) */}
      {/* [개선 SPEC-057] trailing(다른 조합 · 이전기록 숨기기)은 넘기는 쪽(ExerciseBlock)이 ml-auto 를 단다 — 좁은 폭에서 다음 줄로 꺾여도 오른쪽에 붙는다 */}
      {/* [원본] <div className="flex flex-wrap items-center justify-between gap-x-[var(--spacing-sm)]"> */}
      {/* [개선] 글자 크기를 옆 버튼 줄(MetaLine)과 같은 sm 으로 · 꺾여도 세로 틈 8px */}
      <div className="flex flex-wrap items-center justify-between gap-x-[var(--spacing-sm)] gap-y-[8px] text-[length:var(--text-sm)]">
        {/* [원본] 12px ink2 버튼 + 필름 아이콘 — 옆 「다른 조합」·「이전기록 숨기기」(14px ink semibold)와 다른 부품처럼 보였다(REV-130)
        <button
          type="button"
          data-testid="tip-toggle"
          aria-expanded={expanded} // 그 자리 펼침(SPEC-057 REV-128 A10)
          aria-controls={expanded ? `tip-body-${exerciseId}` : undefined}
          onClick={toggle}
          className="flex min-h-[32px] shrink-0 items-center gap-[4px] self-start whitespace-nowrap py-[2px]"
        >
          <Icon name="film-outline" size={14} color="var(--color-ink2)" />
          <AppText variant="label" color="textMuted">
            {t("session.tipToggle")}
          </AppText>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} color="var(--color-ink2)" />
        </button>
        */}
        {/* [개선] 같은 누르는 글자(MetaAction) · 그 자리 펼침이라 ▾/▴ 하나만(R5) · 누르는 자리 44px */}
        <MetaAction
          testId="tip-toggle"
          tall
          ariaExpanded={expanded} // 그 자리 펼침(SPEC-057 REV-128 A10)
          ariaControls={expanded ? bodyId : undefined}
          trailingIcon={expanded ? "chevron-up" : "chevron-down"}
          onPress={toggle}
        >
          {t("session.tipToggle")}
        </MetaAction>
        {trailing}
      </div>

      {expanded && mode === "media" && hasImages ? (
        <button
          type="button"
          data-testid="tip-media"
          id={bodyId}
          // 안내 글을 장식 칩으로 바꿔 버튼 이름이 비었다 — 단계가 있으면 이름을 직접(SPEC-046 P2 리뷰)
          aria-label={steps.length ? t("chip.tipSteps") : undefined}
          onClick={() => steps.length && setMode("steps")}
          className="mt-[var(--spacing-xs)] block w-full"
        >
          {/* [원본] <TwoFrameLoop start={media.start} end={media.end} gif={media.gif} /> */}
          {picto ? (
            <span className="mx-auto block aspect-square w-full max-w-[220px] overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface-alt)">
              {/* [원본] <Pictogram exerciseId={exerciseId} animate className="h-full w-full" testId="tip-picto" /> */}
              <ExerciseMotion exerciseId={exerciseId} className="h-full w-full" testId="tip-motion" />
            </span>
          ) : media ? (
            <TwoFrameLoop start={media.start} end={media.end} gif={media.gif} />
          ) : null}
          {picto ? <MotionNotice exerciseId={exerciseId} /> : null}
          {caution ? (
            <AppText variant="caption" color="textMuted" className="mt-[2px] block" data-testid="tip-caution">
              {t(`exercises.caution.${caution}`)}
            </AppText>
          ) : null}
          {/* [원본] 흐린 안내 글 <AppText variant="label" color="textFaint" center>{t("session.tipTapForSteps")}</AppText>
              — 그림이 눌리는 줄 몰랐다(사용성 1) → [개선] 「단계 보기」 칩(장식형 · 그림 전체가 버튼 · SPEC-046) */}
          {steps.length ? (
            // 아래 세트 표와 떼어 둔다 · 제자리 펼침이라 › 가 아닌 ⌄(P2 리뷰)
            <span className="mt-[4px] mb-[var(--spacing-sm)] flex justify-center">
              <ValueChip as="span" icon="pick" testId="tip-steps-chip">
                <AppText variant="label" color="textMuted">
                  {t("chip.tipSteps")}
                </AppText>
              </ValueChip>
            </span>
          ) : null}
        </button>
      ) : expanded ? (
        <button
          type="button"
          data-testid="tip-steps"
          id={bodyId}
          onClick={() => hasImages && setMode("media")}
          // [원본] rounded-[var(--radius-md)] · [개선] 누르는 판은 4px(SPEC-057 R1)
          className="mt-[var(--spacing-xs)] flex w-full flex-col gap-[var(--spacing-xs)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[var(--spacing-sm)] text-left"
        >
          {steps.map((s, i) => (
            <span key={s} className="flex items-start gap-[var(--spacing-sm)]">
              {/* [원본] 18px 원 판(rounded-pill · brand-muted) 안 빨강 번호 — [개선] 번호 글자만(SPEC-056 F5 · SPEC-057 R2) */}
              {/* [원본] flex w-[18px] justify-center · 진한 번호 — 「9.」「10.」 점이 어긋나고 진한 글자는 누르는 것처럼 읽혔다(REV-130) */}
              <span className="mt-[1px] w-[20px] shrink-0 text-right tabular-nums">
                <AppText variant="label" color="textMuted" className="font-bold">
                  {`${i + 1}.`}
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
