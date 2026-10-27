"use client";
// @plm SRS-079  통계 화면 상단 입구 한 줄 — 「기간 성과 요약 ›」(회색 메타 · 빨강 없음 — 화면 정리 공용 규칙)
import Link from "next/link";
import { t } from "@/lib/i18n";
import { Icon } from "../ui/Icon";

export function SummaryEntry() {
  return (
    <Link
      href="/stats/summary"
      data-testid="stats-summary-entry"
      className="mb-[var(--spacing-sm)] flex min-h-[36px] items-center gap-[6px] self-start text-(--color-ink2) text-[length:var(--text-sm)]"
    >
      <Icon name="stats-chart" size={16} color="var(--color-ink3)" />
      <span>{t("progressSummary.entry")}</span>
      <Icon name="chevron-forward" size={12} color="var(--color-ink3)" />
    </Link>
  );
}
