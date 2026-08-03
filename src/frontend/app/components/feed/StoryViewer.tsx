"use client";
// @plm SRS-019  스토리 뷰어 — app의 Stories.tsx(StoryViewer)를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 검은 화면 가득 한 컷. 위에 진행 막대(컷 개수만큼), 누르면 다음 컷, 마지막에서 누르면 닫힌다.
//
// ── 웹에서 더한 것 ──────────────────────────────────────────────────────────
// app에는 없던 **키보드**를 받는다(→ 다음, ← 이전, Esc 닫기). 웹에서 검은 전체화면에 갇혔을 때
// 빠져나갈 방법이 탭밖에 없으면 안 되기 때문이다.
//
// ── 자동 넘김을 넣지 않은 이유 ──────────────────────────────────────────────
// app이 손으로 넘긴다. 시간이 지나면 저절로 넘어가게 하면 **읽던 캡션이 사라진다** —
// 같은 앱처럼 보이는 것이 목표이므로 없는 동작을 새로 만들지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { TargetType, type StoryGroup } from "@app/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { mediaSrc } from "@/lib/mediaClient";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";
import { ReportSheet } from "../moderation/ReportSheet";

export function StoryViewer({
  group,
  meId,
  onClose,
}: {
  group: StoryGroup | null;
  meId: string | null;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  // 다른 그룹을 열면 첫 컷부터. group은 **값이 아니라 방아쇠**로 쓴다(효과 본문은 그 값을 읽지 않는다).
  // biome-ignore lint/correctness/useExhaustiveDependencies: group은 초기화 방아쇠다
  useEffect(() => setIdx(0), [group]);

  const count = group?.stories.length ?? 0;

  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        setIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key !== "ArrowRight") return;
      // 마지막 컷에서 오른쪽은 **닫기**다 — 눌러 넘기는 것과 같은 동작이어야 한다.
      setIdx((i) => {
        if (i + 1 < count) return i + 1;
        onClose();
        return i;
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  if (!group || !root) return null;
  const story = group.stories[idx];
  if (!story) return null;

  const advance = () => (idx + 1 < count ? setIdx(idx + 1) : onClose());

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 pt-[var(--spacing-xl)]"
      data-testid="story-viewer"
    >
      {/* 진행 막대 — 지금까지 본 컷은 채워져 있다. */}
      <div className="mt-[var(--spacing-lg)] flex gap-[4px] px-[var(--spacing-md)]">
        {group.stories.map((s, i) => (
          <span
            key={s.id}
            style={{ backgroundColor: i <= idx ? "#fff" : "rgba(255,255,255,0.3)" }}
            className="h-[3px] flex-1 rounded-[2px]"
          />
        ))}
      </div>

      <div className="flex items-center justify-between px-[var(--spacing-lg)] py-[var(--spacing-md)]">
        <AppText variant="body" style={{ color: "#fff" }} className="font-medium!">
          {group.author?.displayName || t("discover.unnamed")}
        </AppText>
        <span className="flex items-center gap-[var(--spacing-lg)]">
          {/* 남의 스토리만 신고할 수 있다 — 내 것은 지우면 된다. */}
          {meId && group.author?.id !== meId ? (
            <button
              type="button"
              onClick={() => setReporting(true)}
              aria-label={t("report.title")}
              data-testid="story-report"
            >
              <Icon name="flag-outline" size={22} color="#fff" />
            </button>
          ) : null}
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} data-testid="story-close">
            <Icon name="close" size={28} color="#fff" />
          </button>
        </span>
      </div>

      {/* 사진 자리를 누르면 다음 컷 — app과 같다. */}
      <button
        type="button"
        onClick={advance}
        data-testid="story-advance"
        className="min-h-0 flex-1 cursor-default"
      >
        {/* biome-ignore lint/performance/noImgElement: 스토리지에서 오는 사진 — 최적화 대상이 아니다 */}
        <img
          src={mediaSrc(story.mediaUrl)}
          alt={story.caption || ""}
          data-testid="story-image"
          className="h-full w-full object-contain"
        />
      </button>

      {story.caption ? (
        <div className="px-[var(--spacing-lg)] py-[var(--spacing-xl)] text-center">
          <AppText variant="body" style={{ color: "#fff" }}>
            {story.caption}
          </AppText>
        </div>
      ) : null}
      {reporting ? (
        <ReportSheet targetType={TargetType.STORY} targetId={story.id} onClose={() => setReporting(false)} />
      ) : null}
    </div>,
    root,
  );
}
