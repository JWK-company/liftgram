"use client";
// 종목 상세의 「관련 팁」(SPEC-047 · SRS-112) — 어떤 팁을 보일지는 서버(종목 상세 page)가 tipsForExercise 로 정하고,
// 이 섬은 줄을 눌러 팁 상세 시트를 여는 일만 한다(스펙 리뷰 U5). 팁 0개면 서버가 이 컴포넌트를 렌더하지 않는다.
import { type CreatorTip, tipById } from "@app/core";
import { useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { Card, SectionHeader } from "../ui/primitives";
import { TipDetailSheet, TipRow } from "./CreatorTipSheet";

export function RelatedTips({ tipIds }: { tipIds: string[] }) {
  const tips = useMemo(
    () => tipIds.map((id) => tipById(id)).filter((x): x is CreatorTip => x !== null),
    [tipIds],
  );
  const [open, setOpen] = useState<CreatorTip | null>(null);
  if (!tips.length) return null;
  return (
    <Card>
      <div data-testid="related-tips">
        <SectionHeader title={t("tips.relatedTitle")} />
        <div className="flex flex-col gap-[var(--spacing-sm)]">
          {tips.map((tip) => (
            <TipRow key={tip.id} tip={tip} testId="related-tip" onPress={() => setOpen(tip)} />
          ))}
        </div>
      </div>
      {open ? <TipDetailSheet tip={open} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}
