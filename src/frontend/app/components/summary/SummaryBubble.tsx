"use client";
// @plm SRS-080  DM 말풍선 — 성과 요약(MessageKind.SUMMARY · ADR-041)
//
// 카드는 **고정 문구만**(「성과 요약 · 눌러서 보기」) — 숫자·기간은 열었을 때 GetProgressSummary 결과에서만(S-7).
// 그래서 대화를 열어도 RPC·열람 감사가 쌓이지 않는다. body(옛 앱용 대체 문구)는 무시하고 refId 로 연다(S-8).
// 보낸 쪽(senderId === 나)은 「보낸 성과 요약」, 받는 쪽만 열었을 때 「루틴 처방」 버튼(U-17).
// 알림에서 들어오면(?highlight=summary) 가장 최근 요약 카드를 테두리로 강조하고 보이게 굴린다.
import type { Message } from "@app/contracts";
import type { WeightUnit } from "@app/core";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useWeightUnit } from "../feed/useWeightUnit";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";
import { SummaryOpenDialog } from "./SummaryOpen";

export function SummaryBubble({
  msg,
  mine,
  memberName,
  highlight = false,
}: {
  msg: Message;
  mine: boolean;
  /** 받는 쪽 루틴 처방 판 제목 — 보낸 회원 이름 */
  memberName?: string;
  highlight?: boolean;
}) {
  const unit = useWeightUnit() as WeightUnit;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: "center" });
  }, [highlight]);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid="conv-bubble">
      <button
        ref={ref}
        type="button"
        data-testid="conv-summary-card"
        data-summary-id={msg.refId}
        data-highlight={highlight ? "1" : undefined}
        disabled={!msg.refId}
        onClick={() => setOpen(true)}
        style={{ maxWidth: "78%", borderColor: highlight ? "var(--color-brand)" : "var(--color-line)" }}
        className={`flex min-h-[52px] items-center gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] border bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-left ${
          highlight ? "border-2" : ""
        } ${mine ? "rounded-br-[var(--radius-sm)]" : "rounded-bl-[var(--radius-sm)]"}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
          <Icon name="stats-chart" size={18} color="var(--color-ink2)" />
        </span>
        <AppText variant="body" className="min-w-0 flex-1 font-medium!">
          {t(mine ? "progressSummary.cardMine" : "progressSummary.card")}
        </AppText>
        <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
      </button>
      {open && msg.refId ? (
        <SummaryOpenDialog
          summaryId={msg.refId}
          viewAs={mine ? "sender" : "receiver"}
          memberName={memberName}
          unit={unit}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
