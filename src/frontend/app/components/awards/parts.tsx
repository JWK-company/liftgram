"use client";
// 이달의 리프터(SPEC-063) — 화면 조각: 수상 카드 · 예시 카드 · 상 이름.
//
// 예시 카드는 실제 수상자로 오인되지 않게(REV-153 화면 M3): 이름 글 자체에 「예시」 · 실루엣 · 점선 테두리 ·
// PR 금색 금지 · 링크 없음 · aria 「예시 카드, 실제 수상자 아님」. 앱 코드의 고정 글이다(DB 행이 아니다).
import type { PublicAward } from "@app/contracts";
import { routes } from "@app/contracts";
import { t, type TransKey } from "@/lib/i18n";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";

export function categoryLabel(category: string): string {
  const key = `awards.cat.${category}` as TransKey;
  return category === "steady" || category === "popular" || category === "pick" ? t(key) : category;
}

function WinnerAvatar({ name, url }: { name?: string; url?: string }) {
  if (url || name) return <Avatar name={name} url={url} size={40} />;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--color-surface-alt)">
      <Icon name="person-circle-outline" size={28} color="var(--color-ink3)" />
    </span>
  );
}

/** 실제 수상 한 줄. 비공개·탈퇴면 이름 대신 그 표시 · 프로필로 가지 않는다. */
export function WinnerRow({ w }: { w: PublicAward }) {
  const name = w.hidden
    ? t("awards.hiddenWinner")
    : w.withdrawn
      ? t("awards.withdrawnWinner")
      : w.displayName || "—";
  const facts: string[] = [];
  if (!w.hidden && w.category === "steady" && w.days > 0) facts.push(t("awards.winnerDays", { n: w.days }));
  if (!w.hidden && w.category === "popular" && w.likes > 0)
    facts.push(t("awards.winnerLikes", { n: w.likes }));
  const body = (
    <>
      <WinnerAvatar
        name={w.hidden || w.withdrawn ? undefined : w.displayName}
        url={w.hidden || w.withdrawn ? undefined : w.avatarUrl}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--text-xs)] text-(--color-ink2)">
          {categoryLabel(w.category)}
        </span>
        <span className="block truncate font-semibold">{name}</span>
        {facts.length ? (
          <span className="block text-[length:var(--text-xs)] text-(--color-ink2)">{facts.join(" · ")}</span>
        ) : null}
        {!w.hidden && w.reason ? (
          <span className="block break-words text-[length:var(--text-sm)] text-(--color-ink2) [overflow-wrap:anywhere]">
            {w.reason}
          </span>
        ) : null}
      </span>
    </>
  );
  const cls = "flex items-center gap-[var(--spacing-sm)] py-[var(--spacing-sm)]";
  if (!w.hidden && !w.withdrawn && w.userId) {
    return (
      <a href={routes.userProfile(w.userId)} className={`${cls} min-h-11`} data-testid="awards-winner">
        {body}
        <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
      </a>
    );
  }
  return (
    <div className={cls} data-testid="awards-winner">
      {body}
    </div>
  );
}

function ExampleCard({
  category,
  names,
  note,
  goal,
}: {
  category: string;
  names: string[];
  note: TransKey;
  goal: number;
}) {
  // [원본] <fieldset aria-label=…> — 폼 묶음 의미라 일부 화면 읽기가 「그룹」만 읽었다 → [개선] article(REV-155 화면 4)
  return (
    <article
      aria-label={t("awards.exampleAria")}
      data-testid="awards-example-card"
      className="min-w-0 rounded-[var(--radius-md)] border border-(--color-line-strong) border-dashed p-[var(--spacing-md)]"
    >
      <div className="flex items-center justify-between gap-[var(--spacing-sm)] text-[length:var(--text-xs)] text-(--color-ink2)">
        <span>{categoryLabel(category)}</span>
        {/* 카드 한 장만 보여도 예시임을 알게 — 글자 표식 */}
        <span className="shrink-0 border border-(--color-line-strong) px-[var(--spacing-xs)]" aria-hidden>
          {t("awards.exampleTag")}
        </span>
      </div>
      <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-x-[var(--spacing-md)] gap-y-[var(--spacing-xs)]">
        {names.map((n) => (
          <span key={n} className="flex items-center gap-[var(--spacing-xs)]">
            <Icon name="person-circle-outline" size={24} color="var(--color-ink3)" />
            <span className="text-(--color-ink2)">{n}</span>
          </span>
        ))}
      </div>
      <div className="mt-[var(--spacing-xs)] text-[length:var(--text-xs)] text-(--color-ink3)">
        {t(note, { goal })}
      </div>
    </article>
  );
}

/** 발표된 달이 하나도 없을 때만 보이는 예시 구역(REV-153 화면 C2) */
export function ExampleSection({ goal }: { goal: number }) {
  const n = (letter: string) => t("awards.exampleName", { letter });
  return (
    <section
      data-testid="awards-example"
      aria-labelledby="awards-example-title"
      className="flex flex-col gap-[var(--spacing-sm)]"
    >
      <h3
        id="awards-example-title"
        className="font-semibold text-(--color-ink2) text-[length:var(--text-sm)]"
      >
        {t("awards.exampleTitle")}
      </h3>
      <ExampleCard
        category="steady"
        names={[n("A"), n("B"), n("C")]}
        note="awards.exampleSteadyNote"
        goal={goal}
      />
      <ExampleCard category="popular" names={[n("D")]} note="awards.examplePopularNote" goal={goal} />
      <ExampleCard category="pick" names={[n("E")]} note="awards.examplePickNote" goal={goal} />
    </section>
  );
}

/** 상 배지 — 프로필에 붙는 작은 글자 줄(바탕 없는 정보 표시 · 알약 모양 아님) */
export function AwardBadgeList({
  items,
  testId,
}: {
  items: { month: string; category: string; label: string }[];
  testId: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={t("awards.badgesAria")}
      data-testid={testId}
      className="flex flex-wrap gap-x-[var(--spacing-md)] gap-y-[var(--spacing-xs)]"
    >
      {items.map((b) => (
        <li
          key={`${b.month}-${b.category}`}
          className="flex items-center gap-[var(--spacing-xs)] text-[length:var(--text-sm)] text-(--color-ink2)"
        >
          <Icon name="trophy-outline" size={16} color="var(--color-ink2)" />
          {b.label}
        </li>
      ))}
    </ul>
  );
}
