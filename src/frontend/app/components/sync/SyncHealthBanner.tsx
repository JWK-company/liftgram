"use client";
// @plm SRS-053  백업 경고 띠 — 동기가 조용히 실패하는 일이 없게 화면 위에 띄운다 (2026-10-26)
//
// 두 경우에만 뜬다:
//   ① 로그인했는데 백업이 멈췄다(연속 실패·하루 넘게 성공 없음·다른 계정 기록으로 멈춤) — 닫을 수 없다
//   ② 로그인하지 않았는데 이 기기에만 기록이 쌓였다(1건 이상 · SRS-086 — 전에는 5건) — "나중에"로 하루 접는다(전에는 7일)
// 누르면 계정 화면의 서버 동기·백업 카드로 간다(지금 동기 · 백업 파일 내보내기가 거기 있다).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { getPref, setPref } from "@/lib/prefs";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { isBackupStalled, useSyncHealth } from "./useSyncHealth";
import { localOnlyBannerVisible } from "@app/core/domain/loginNudge";
import { anonCompletedCount } from "@/lib/loginNudge";

const DISMISS_KEY = "sync_localonly_dismissed_at";
// [원본] 5건부터 · 「나중에」 7일 — 비로그인 기기 기록을 너무 늦게·오래 숨겼다(SRS-086)
// const LOCAL_ONLY_MIN = 5;
// [개선] 1건부터 · 하루 접기 — 판정은 core localOnlyBannerVisible @plm SRS-086

export function SyncHealthBanner() {
  const { user, loading } = useAuth();
  const h = useSyncHealth();
  const path = usePathname();
  const [dismissedAt, setDismissedAt] = useState<number>(0);
  useEffect(() => setDismissedAt(Number(getPref(DISMISS_KEY) ?? 0)), []);

  if (loading || path?.startsWith("/account")) return null;

  const stalled = !!user && isBackupStalled(h);
  // [원본] const localOnly =
  //   !user && (h.pending ?? 0) >= LOCAL_ONLY_MIN && Date.now() - dismissedAt > 7 * 24 * 3600_000;
  // 진행 중인 운동 화면에서는 띄우지 않는다 — 운동 흐름을 끊지 않게(qa spec H-3)
  const localOnly =
    !user &&
    !path?.startsWith("/workout") &&
    localOnlyBannerVisible({
      pending: h.pending,
      anonCompletedCount: anonCompletedCount(),
      // 권유 시트의 「나중에」도 이 키를 쓴다 — 마운트 때 한 번 읽은 값이 아니라 그릴 때마다 읽는다(qa code M-2)
      dismissedAt: Math.max(dismissedAt, Number(getPref(DISMISS_KEY) ?? 0)),
      now: Date.now(),
    });
  if (!stalled && !localOnly) return null;

  return (
    <div
      // 멈춤 경고는 alert, 로컬 띠는 덜 급한 status(qa code M-2 — 곧바로 읽어 내리지 않게)
      role={stalled ? "alert" : "status"}
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
