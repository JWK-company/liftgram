"use client";
// @plm SRS-020  신고 시트 — app의 features/social/ReportSheet.tsx를 웹으로
//
// 사유는 **고정 목록**이다(계약도 enum이다). 자유 입력이면 집계도 정책 대응도 못 한다.
// 고르는 즉시 보낸다 — 신고는 두 번 확인받을 일이 아니다(잘못 눌러도 검토자가 기각한다).
import { Reason, type TargetType } from "@app/contracts";
import { useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { feedErrorMessage } from "@/lib/feedClient";
import { moderationClient } from "@/lib/moderationClient";
import { useToast } from "../Toast";
import { Overlay } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

/** 화면에 보이는 순서 = app과 같다. */
const REASONS: { value: Reason; key: TransKey }[] = [
  { value: Reason.SPAM, key: "report.reason.spam" },
  { value: Reason.NUDITY, key: "report.reason.nudity" },
  { value: Reason.HARASSMENT, key: "report.reason.harassment" },
  { value: Reason.VIOLENCE, key: "report.reason.violence" },
  { value: Reason.SELF_HARM, key: "report.reason.self_harm" },
  { value: Reason.MINOR_SAFETY, key: "report.reason.minor_safety" },
  { value: Reason.MISINFORMATION, key: "report.reason.misinformation" },
  { value: Reason.OTHER, key: "report.reason.other" },
];

export function ReportSheet({
  targetType,
  targetId,
  onClose,
}: {
  targetType: TargetType;
  targetId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function submit(reason: Reason) {
    if (busy) return;
    setBusy(true);
    try {
      await moderationClient().report({ targetType, targetId, reason });
      toast(t("report.submitted"));
      onClose();
    } catch (e) {
      toast(feedErrorMessage(e), "error");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} testId="report-sheet">
      <AppText variant="heading">{t("report.title")}</AppText>
      <ul className="mt-[var(--spacing-md)] flex flex-col">
        {REASONS.map((r, i) => (
          <li key={r.key}>
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(r.value)}
              data-testid="report-reason"
              style={{ borderTopWidth: i === 0 ? 0 : 1, borderColor: "var(--color-line)" }}
              className="w-full py-[var(--spacing-md)] text-left"
            >
              <AppText variant="body">{t(r.key)}</AppText>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClose}
        className="mt-[var(--spacing-sm)] w-full py-[var(--spacing-sm)]"
      >
        <AppText variant="body" color="textMuted">
          {t("report.cancel")}
        </AppText>
      </button>
    </Overlay>
  );
}
