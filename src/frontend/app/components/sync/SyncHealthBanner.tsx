"use client";
// @plm SRS-006  백업 경고 띠 — 동기가 조용히 실패하는 일이 없게 화면 위에 띄운다 (2026-10-26)
//
// 두 경우에만 뜬다:
//   ① 로그인했는데 백업이 멈췄다(연속 실패·하루 넘게 성공 없음·다른 계정 기록으로 멈춤) — 닫을 수 없다
//   ② 로그인하지 않았는데 이 기기에만 기록이 쌓였다(5건 이상) — "나중에"로 7일 접을 수 있다
// 누르면 계정 화면의 서버 동기·백업 카드로 간다(지금 동기 · 백업 파일 내보내기가 거기 있다).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { getPref, setPref } from "@/lib/prefs";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { isBackupStalled, useSyncHealth } from "./useSyncHealth";

const DISMISS_KEY = "sync_localonly_dismissed_at";
const LOCAL_ONLY_MIN = 5;

export function SyncHealthBanner() {
  const { user, loading } = useAuth();
  const h = useSyncHealth();
  const path = usePathname();
  const [dismissedAt, setDismissedAt] = useState<number>(0);
  useEffect(() => setDismissedAt(Number(getPref(DISMISS_KEY) ?? 0)), []);

  if (loading || path?.startsWith("/account")) return null;

  const stalled = !!user && isBackupStalled(h);
  const localOnly =
    !user && (h.pending ?? 0) >= LOCAL_ONLY_MIN && Date.now() - dismissedAt > 7 * 24 * 3600_000;
  if (!stalled && !localOnly) return null;

  return (
    <div
      role="alert"
      data-testid={stalled ? "sync-stalled-banner" : "sync-localonly-banner"}
      className="mx-[var(--spacing-md)] mt-[var(--spacing-sm)] flex items-start gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-warn) bg-(--color-card) p-[var(--spacing-md)] text-sm"
    >
      <Icon name="alert-circle-outline" size={20} color="var(--color-warn)" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {h.blocked
            ? t("syncHealth.blockedTitle")
            : stalled
              ? t("syncHealth.warnTitle")
              : t("syncHealth.localOnlyTitle")}
        </div>
        <div className="mt-[2px] text-(--color-ink2)">
          {stalled ? t("syncHealth.warnBody", { count: h.pending ?? 0 }) : t("syncHealth.localOnlyBody")}
        </div>
        <div className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-md)]">
          <a href="/account" className="font-semibold text-(--color-brand)">
            {t("syncHealth.openProfile")}
          </a>
          {!stalled ? (
            <button
              type="button"
              className="text-(--color-ink2)"
              onClick={() => {
                const now = Date.now();
                setPref(DISMISS_KEY, String(now));
                setDismissedAt(now);
              }}
            >
              {t("syncHealth.later")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
