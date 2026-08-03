"use client";
// @plm SRS-019  스토리 트레이 — app의 features/social/Stories.tsx(StoryTray)를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 가로로 넘기는 아바타 줄. 첫 칸은 **언제나 나**다(서버가 내 그룹을 맨 앞에 준다).
//   · 내 스토리가 없으면 첫 칸은 `+` — 누르면 사진을 고른다
//   · 있으면 썸네일 + 오른쪽 아래 `+` 배지(계속 추가할 수 있게)
//   · 안 본 컷이 있으면 **강조 링**, 다 봤으면 흐린 링(인스타·카톡과 같은 약속)
//
// 트레이는 세로로 눌리면 안 된다 — 창이 짧을 때 아바타가 잘려 무엇인지 알 수 없게 된다.
// 그래서 shrink를 막고 높이를 내용으로 고정한다(app이 같은 이유로 고친 자리다).
// ─────────────────────────────────────────────────────────────────────────────
import type { StoryGroup } from "@app/contracts";
import { useRef } from "react";
import { t } from "@/lib/i18n";
import { mediaSrc } from "@/lib/mediaClient";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";
import { hasUnseen, type StorySeenMap } from "./storySeen";

const AVATAR = 60;

export function StoryTray({
  groups,
  meId,
  seen,
  busy,
  onOpen,
  onAdd,
}: {
  groups: StoryGroup[];
  meId: string | null;
  seen: StorySeenMap;
  busy?: boolean;
  onOpen: (g: StoryGroup) => void;
  onAdd: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mine = meId ? groups.find((g) => g.author?.id === meId) : undefined;
  const others = groups.filter((g) => g.author?.id !== mine?.author?.id);

  return (
    <div
      className="flex shrink-0 gap-[var(--spacing-md)] overflow-x-auto px-[var(--spacing-lg)] py-[var(--spacing-sm)]"
      data-testid="story-tray"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        data-testid="story-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = ""; // 같은 파일을 다시 고를 수 있게
        }}
      />

      {/* 첫 칸 = 나. 스토리가 있으면 열고, 없으면 바로 고르기로 간다. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => (mine ? onOpen(mine) : inputRef.current?.click())}
        data-testid="story-mine"
        className="flex shrink-0 flex-col items-center"
        style={{ width: AVATAR + 16 }}
      >
        <span className="relative">
          <Ring unseen={mine ? hasUnseen(mine, seen) : false} empty={!mine}>
            {mine ? <Thumb group={mine} /> : <Icon name="add" size={26} color="var(--color-brand)" />}
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                <span
                  role="status"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                />
              </span>
            ) : null}
          </Ring>
          {/* 스토리가 있어도 계속 추가할 수 있게 — 배지를 따로 둔다(타일 자체는 '보기'다). */}
          {mine ? (
            <button
              type="button"
              disabled={busy}
              data-testid="story-add"
              aria-label={t("feed.addImage")}
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="absolute right-0 bottom-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-(--color-bg) bg-(--color-brand)"
            >
              <Icon name="add" size={14} color="var(--color-on-brand)" />
            </button>
          ) : null}
        </span>
        <AppText variant="label" color="textMuted" className="mt-[var(--spacing-xs)] block truncate">
          {t("story.myStory")}
        </AppText>
      </button>

      {others.map((g) => (
        <button
          key={g.author?.id}
          type="button"
          onClick={() => onOpen(g)}
          data-testid="story-tile"
          className="flex shrink-0 flex-col items-center"
          style={{ width: AVATAR + 16 }}
        >
          <Ring unseen={hasUnseen(g, seen)}>
            <Thumb group={g} />
          </Ring>
          <AppText variant="label" className="mt-[var(--spacing-xs)] block max-w-full truncate">
            {g.author?.displayName || t("discover.unnamed")}
          </AppText>
        </button>
      ))}
    </div>
  );
}

/** 안 본 컷이 있으면 브랜드색, 다 봤으면 흐린 테두리. 내 스토리가 없을 때는 테두리가 없다. */
function Ring({ unseen, empty, children }: { unseen: boolean; empty?: boolean; children: React.ReactNode }) {
  const color = empty ? "transparent" : unseen ? "var(--color-brand)" : "var(--color-line)";
  return (
    <span
      data-unseen={unseen ? "true" : "false"}
      style={{ width: AVATAR + 8, height: AVATAR + 8, borderColor: color }}
      className="flex items-center justify-center rounded-full border-[2.5px]"
    >
      <span
        style={{ width: AVATAR, height: AVATAR }}
        className={`relative flex items-center justify-center overflow-hidden rounded-full bg-(--color-surface-alt) ${
          empty ? "border border-(--color-line)" : ""
        }`}
      >
        {children}
      </span>
    </span>
  );
}

/** 그룹의 **최신 컷**이 썸네일이다(마지막이 최신 — 서버가 오래된 것부터 준다). */
function Thumb({ group }: { group: StoryGroup }) {
  const last = group.stories.at(-1);
  if (!last) return null;
  return (
    // biome-ignore lint/performance/noImgElement: 스토리지에서 오는 사진 — 최적화 대상이 아니다
    <img src={mediaSrc(last.mediaUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
  );
}
