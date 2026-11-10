"use client";
// 코칭 표시 조각(SPEC-050 P1b) — 「코치」 배지 · 「코칭 중」 배지 · 코치 카드(이름·배지·소개·태그).
// 색은 코칭 청록 토큰(--color-coaching*)만 쓴다 — 빨강은 화면의 주 버튼 몫이다.
import type { TransKey } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { Avatar } from "../ui/Avatar";
import { AppText } from "../ui/primitives";

/** 「코치」 — 청록 테두리·글자의 작은 알약(이름 옆). */
export function CoachBadge({ testId }: { testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex shrink-0 items-center rounded-[var(--radius-pill)] border border-(--color-coaching) bg-(--color-coaching-soft) px-[var(--spacing-sm)] py-[1px] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]"
    >
      {t("coaching.coachBadge")}
    </span>
  );
}

/** 「코칭 중」 — 청록 옅은 판(대화방 머리·프로필). */
export function CoachingActiveBadge({ testId, label }: { testId?: string; label?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius-pill)] bg-(--color-coaching-soft) px-[var(--spacing-sm)] py-[3px] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]"
    >
      {label ?? t("coaching.activeBadge")}
    </span>
  );
}

/** 코치 태그 묶음 — 모르는 값은 건너뛴다(옛 앱·새 태그). */
export function CoachTags({ tags, testId }: { tags: readonly string[]; testId?: string }) {
  const known = tags.filter((x) => KNOWN.has(x));
  if (known.length === 0) return null;
  return (
    <div data-testid={testId} className="flex flex-wrap gap-[var(--spacing-xs)]">
      {known.map((tag) => (
        <span
          key={tag}
          className="rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[2px] text-(--color-ink2) text-[length:var(--text-xs)]"
        >
          {t(`coaching.tag.${tag}` as TransKey)}
        </span>
      ))}
    </div>
  );
}
const KNOWN = new Set(["hypertrophy", "strength", "diet", "rehab", "beginner", "powerlifting"]);

/** 코치 카드 — 초대 코드로 연결·join 화면·범위 시트 머리. */
export function CoachCard({
  name,
  avatarUrl,
  bio,
  tags,
  coach = false,
  testId = "coach-card",
}: {
  name: string;
  avatarUrl?: string;
  bio?: string;
  tags?: readonly string[];
  /** 「코치」 배지 — 활성 연결의 코치일 때만(SPEC-052 · 서버 파생값 isCoach). [원본] 늘 붙였다. */
  coach?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-start gap-[var(--spacing-md)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-md)]"
    >
      <Avatar name={name} url={avatarUrl} size={48} />
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--spacing-xs)]">
        <div className="flex min-w-0 items-center gap-[var(--spacing-xs)]">
          <AppText variant="body" className="min-w-0 truncate font-semibold!" data-testid="coach-card-name">
            {name || t("discover.unnamed")}
          </AppText>
          {/* [원본] <CoachBadge testId="coach-card-badge" /> */}
          {coach ? <CoachBadge testId="coach-card-badge" /> : null}
        </div>
        {bio ? (
          <AppText
            variant="caption"
            color="textMuted"
            className="block break-words"
            data-testid="coach-card-bio"
          >
            {bio}
          </AppText>
        ) : null}
        {tags && tags.length > 0 ? <CoachTags tags={tags} testId="coach-card-tags" /> : null}
      </div>
    </div>
  );
}
