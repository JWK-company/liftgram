"use client";
// 운동 팁 시트(SPEC-047 · SRS-112) — 주제 하나를 열면 팁 목록, 팁을 고르면 같은 시트 안에서 상세.
//
// 규칙(ADR-045 · SRS-091 과 같다): 출처는 「출처: 채널 · 「제목」」 인용으로만 · 원본은 유튜브 링크(새 창) · 제휴·보증 아님 고지.
// 상세에서 기기 뒤로·바깥 누르기·「‹ 목록」은 모두 목록으로 돌아간다(스펙 리뷰 U2) — 시트는 하나만 쓴다(U3).
// 팁 화면에는 주 행동이 없어 강조색을 쓰지 않는다(U4 · 화면 정리 P4).
import {
  chapterTimeLabel,
  type CreatorTip,
  muscleLabel,
  tipChannelLabel,
  type TipTopic,
  tipsFor,
  tipWatchUrl,
} from "@app/core";
import { useEffect, useRef, useState } from "react";
import { useBackToClose } from "@/lib/useBackToClose";
import { lang, t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

/** 정정·삭제 요청 연락처(루틴 시트와 같은 창구) */
const CONTACT = "admin@tarae.org";

function sourceLine(tip: CreatorTip): string {
  return t("creator.source", {
    channel: lang === "ko" ? tipChannelLabel(tip) : tip.source.channel,
    title: tip.source.title,
  });
}

/** 부위 칩(무채) — 일반 팁(fullBody)은 「전신」 */
function MuscleChips({ tip }: { tip: CreatorTip }) {
  return (
    <div className="flex flex-wrap gap-[4px]">
      {tip.muscles.map((m) => (
        <span
          key={m}
          className="rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[8px] py-[2px] text-(--color-ink2) text-[length:var(--text-xs)]"
        >
          {muscleLabel(m, lang === "ko" ? "ko" : "en")}
        </span>
      ))}
    </div>
  );
}

/** 목록 한 줄 — 제목 · 부위 · 「출처: 채널」 */
export function TipRow({ tip, onPress, testId }: { tip: CreatorTip; onPress: () => void; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId ?? `tip-row-${tip.id}`}
      onClick={onPress}
      className="flex min-w-0 flex-col gap-[4px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
    >
      <AppText variant="body" className="block break-words font-bold">
        {tip.titleKo}
      </AppText>
      <MuscleChips tip={tip} />
      <AppText variant="caption" color="textMuted" className="block truncate">
        {t("tips.sourceShort", { channel: lang === "ko" ? tipChannelLabel(tip) : tip.source.channel })}
      </AppText>
    </button>
  );
}

/** 팁 상세 본문 — 시트 안에 넣는다(주제 시트·종목 상세·루틴 미리보기가 같이 쓴다) */
export function TipDetail({
  tip,
  backLabel,
  onBack,
}: {
  tip: CreatorTip;
  backLabel: string;
  onBack: () => void;
}) {
  // 상세로 바뀌면 「‹ 뒤로」에 포커스 — 화면 읽기·키보드가 새 내용의 처음에서 시작한다(코드 리뷰 REV-089)
  const backRef = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 팁이 바뀔 때마다 다시 맞춘다
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, [tip.id]);
  return (
    <div data-testid="tip-detail" data-tip-id={tip.id}>
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        data-testid="tip-back"
        className="mt-[2px] min-h-[44px] text-left text-(--color-ink2) text-[length:var(--text-sm)]"
      >
        ‹ {backLabel}
      </button>
      <AppText variant="heading" className="block break-words">
        {tip.titleKo}
      </AppText>
      <div className="mt-[4px]">
        <MuscleChips tip={tip} />
      </div>
      {lang === "ko" ? null : (
        <AppText variant="label" color="textMuted" className="mt-[2px] block">
          {t("creator.koreanContent")}
        </AppText>
      )}
      <ul className="mt-[var(--spacing-sm)] flex flex-col gap-[6px]" data-testid="tip-points">
        {tip.pointsKo.map((p) => (
          <li key={p.text} className="flex gap-[var(--spacing-sm)]">
            <span aria-hidden className="text-(--color-ink3)">
              •
            </span>
            <AppText variant="body" className="flex-1">
              {p.text}
            </AppText>
          </li>
        ))}
      </ul>
      {tip.cautionKo ? (
        <div
          className="mt-[var(--spacing-sm)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[var(--spacing-sm)]"
          data-testid="tip-caution"
        >
          <AppText variant="caption" color="textMuted">
            {t("tips.cautionLabel")} · {tip.cautionKo}
          </AppText>
        </div>
      ) : null}

      {tip.chapters?.length ? (
        <div className="mt-[var(--spacing-md)]" data-testid="tip-chapters">
          <AppText variant="label" color="textMuted" className="block">
            {t("tips.chaptersTitle")}
          </AppText>
          <ul className="mt-[2px] flex flex-col">
            {tip.chapters.map((c) => (
              <li key={c.sec}>
                <a
                  href={tipWatchUrl(tip, c.sec)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="tip-chapter"
                  aria-label={t("tips.chapterAria", { time: chapterTimeLabel(c.sec), label: c.labelKo })}
                  className="flex min-h-[40px] items-center gap-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-sm)]"
                >
                  <span className="w-[48px] shrink-0 text-(--color-ink3) tabular-nums">
                    {chapterTimeLabel(c.sec)}
                  </span>
                  <span className="min-w-0 flex-1 underline decoration-(--color-line-strong)">
                    {c.labelKo}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AppText
        variant="caption"
        color="textMuted"
        className="mt-[var(--spacing-md)] block"
        data-testid="tip-source"
      >
        {sourceLine(tip)}
      </AppText>
      <AppText variant="label" color="textMuted" className="mt-[2px] block">
        {tip.basis
          ? t("creator.checkedOnly", { date: tip.source.verifiedAt })
          : t("creator.verified", { date: tip.source.verifiedAt })}
      </AppText>
      {tip.basis ? (
        <a
          href={tip.basis.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-[2px] flex min-h-[32px] items-center text-(--color-ink3) text-[length:var(--text-xs)] underline"
        >
          {t("tips.basis", { label: tip.basis.labelKo })}
        </a>
      ) : null}
      <a
        href={tipWatchUrl(tip)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="tip-open-video"
        aria-label={t("creator.openVideoAria")}
        className="mt-[var(--spacing-sm)] flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-(--color-line-strong) font-medium text-(--color-ink) text-[length:var(--text-md)]"
      >
        {t("creator.openVideo")} ↗
      </a>
      <AppText
        variant="label"
        color="textMuted"
        className="mt-[var(--spacing-md)] block"
        data-testid="tip-safety"
      >
        {t("tips.safety")}
      </AppText>
      <AppText variant="label" color="textMuted" className="mt-[4px] block" data-testid="tip-disclaimer">
        {t("tips.disclaimer", { email: CONTACT })}
      </AppText>
    </div>
  );
}

/** 운동 탭의 주제 카드를 누르면 여는 시트 — 팁 목록 → 상세(같은 시트) */
export function CreatorTipTopicSheet({ topic, onClose }: { topic: TipTopic; onClose: () => void }) {
  const tips = tipsFor(topic.id);
  const [picked, setPicked] = useState<CreatorTip | null>(null);
  const title = lang === "ko" ? topic.nameKo : topic.nameEn;
  // 상세에서는 닫기(바깥 누르기·Esc)가 목록으로 돌아가기다
  const back = () => setPicked(null);
  // 기기 뒤로 — 상세를 열 때 history 칸을 하나 더 쌓아, 뒤로 한 번 = 목록 · 한 번 더 = 시트 닫기(코드 리뷰 REV-089 H-1:
  // [원본] 같은 Overlay 의 칸 하나를 상세가 써 버려, 목록에서 다시 뒤로를 누르면 시트는 남고 밑 화면이 이전 주소로 갔다)
  useBackToClose(back, picked !== null);
  return (
    <SheetShell
      title={picked ? "" : title}
      ariaLabel={picked ? picked.titleKo : title}
      onClose={picked ? back : onClose}
      hideOk
      testId="tip-topic-sheet"
    >
      {picked ? (
        <TipDetail tip={picked} backLabel={t("tips.backToList", { topic: title })} onBack={back} />
      ) : (
        <>
          <AppText variant="body" color="textMuted" className="mt-[4px] block">
            {lang === "ko" ? topic.blurbKo : topic.blurbEn}
          </AppText>
          {lang === "ko" ? null : (
            <AppText variant="label" color="textMuted" className="block">
              {t("creator.koreanContent")}
            </AppText>
          )}
          <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-sm)]">
            {tips.map((tip) => (
              <TipRow key={tip.id} tip={tip} onPress={() => setPicked(tip)} />
            ))}
          </div>
          <div className="mt-[var(--spacing-md)]">
            <Button title={t("creator.close")} variant="secondary" onPress={onClose} />
          </div>
        </>
      )}
    </SheetShell>
  );
}

/** 팁 하나만 여는 시트 — 종목 상세의 「관련 팁」에서 */
export function TipDetailSheet({ tip, onClose }: { tip: CreatorTip; onClose: () => void }) {
  return (
    <SheetShell title="" ariaLabel={tip.titleKo} onClose={onClose} hideOk testId="tip-detail-sheet">
      <TipDetail tip={tip} backLabel={t("tips.close")} onBack={onClose} />
    </SheetShell>
  );
}
