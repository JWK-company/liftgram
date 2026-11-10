"use client";
// 글 공개 범위 선택(SPEC-030) — 추천 탭이 공개 글을 낯선 사람에게 보여 주므로 글마다 고를 수 있어야 한다.
import { Visibility } from "@app/contracts";
import { useId } from "react";
import { t } from "@/lib/i18n";

const OPTIONS = [
  { value: Visibility.PUBLIC, label: "feed.visibilityPublic", testId: "visibility-public" },
  { value: Visibility.FOLLOWERS, label: "feed.visibilityFollowers", testId: "visibility-followers" },
  { value: Visibility.PRIVATE, label: "feed.visibilityPrivate", testId: "visibility-private" },
] as const;

export function VisibilityPicker({
  value,
  onChange,
  disabled,
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset data-testid="visibility-picker" className="flex gap-[var(--spacing-xs)]">
      <legend className="sr-only">{t("feed.visibilityLabel")}</legend>
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <label
            key={o.value}
            data-testid={o.testId}
            // [원본] 고른 칸 = "border-(--color-brand) bg-(--color-brand-muted) …" · 안 고른 칸 = "border-(--color-line) …"
            // [개선] SPEC-056 F6·F7 — 고른 칸은 바탕 채움 없이 빨강 테두리 + 굵은 글자 · 누르는 칸 경계는 --color-line-strong
            className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-[var(--spacing-xs)] text-[length:var(--text-sm)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--color-brand) has-[:focus-visible]:outline-offset-2 has-[:disabled]:cursor-default has-[:disabled]:opacity-60 ${
              on
                ? "border-(--color-brand) font-semibold text-(--color-ink)"
                : "border-(--color-line-strong) text-(--color-ink2)"
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={on}
              disabled={disabled}
              onChange={() => onChange(o.value)}
            />
            {t(o.label)}
          </label>
        );
      })}
    </fieldset>
  );
}
