"use client";
// 프로필 설정 한 줄 — 「내 글을 추천에 표시」(SPEC-030). 값은 서버에 있다: 다른 사람의 추천을 서버가 고른다.
import { SwitchLook } from "./EffortLoggingRow";
import { useEffect, useId, useState } from "react";
import { feedClient } from "@/lib/feedClient";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";

export function RecommendOptOutRow() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const descId = useId();

  useEffect(() => {
    let closed = false;
    feedClient()
      .getFeedPrefs({})
      .then((r) => {
        if (!closed) setOn(r.showInRecommended);
      })
      .catch(() => {});
    return () => {
      closed = true;
    };
  }, []);

  // 값을 읽지 못하면 그리지 않는다 — 틀린 상태를 켜짐으로 보여 주지 않는다.
  if (on === null) return null;

  async function toggle() {
    if (busy || on === null) return;
    const next = !on;
    setBusy(true);
    setOn(next);
    try {
      const res = await feedClient().setFeedPrefs({ showInRecommended: next });
      setOn(res.showInRecommended);
    } catch {
      setOn(!next);
      toast(t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("feed.recommendOptTitle")}
      aria-describedby={descId}
      data-testid="switch-recommend-opt"
      onClick={toggle}
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-sm)] text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {t("feed.recommendOptTitle")}
        </span>
        <span id={descId} className="break-words text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("feed.recommendOptCaption")}
        </span>
      </span>
      <SwitchLook on={on} />
    </button>
  );
}
