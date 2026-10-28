"use client";
// 동기 건강을 화면 상태로 — core/sync/syncEngine 의 subscribeSyncHealth 를 React에 잇는다.
import { isBackupStalled as isBackupStalledCore } from "@app/core/domain/syncStall";
import { getSyncHealth, subscribeSyncHealth, type SyncHealth } from "@app/core/sync/syncEngine";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

export function useSyncHealth(): SyncHealth {
  const [h, setH] = useState<SyncHealth>(getSyncHealth());
  useEffect(() => subscribeSyncHealth(setH), []);
  return h;
}

/** "3시간 전" 같은 말로. */
export function agoText(ms: number | null, now = Date.now()): string {
  if (!ms) return t("syncHealth.never");
  const m = Math.floor((now - ms) / 60_000);
  const when =
    m < 1
      ? t("syncHealth.justNow")
      : m < 60
        ? t("syncHealth.minutesAgo", { n: m })
        : m < 60 * 24
          ? t("syncHealth.hoursAgo", { n: Math.floor(m / 60) })
          : t("syncHealth.daysAgo", { n: Math.floor(m / 1440) });
  return t("syncHealth.lastBackup", { time: when });
}

// [원본] 판정 식이 여기 있었다 — 운영 화면(서버)과 같은 식이어야 해서 core 한 곳(syncStall.ts)으로 옮겼다(qa spec H-1). @plm SRS-088
// /** 백업이 멈췄다고 **경고할** 때인가 — 올라갈 기록이 있는데 실패가 이어지거나 오래 성공이 없다. */
// export function isBackupStalled(h: SyncHealth, now = Date.now()): boolean {
//   if (!h.pending) return false;
//   if (h.blocked) return true;
//   if (h.consecutiveFailures >= 3) return true;
//   // 한 번도 성공 못 했거나 마지막 성공이 하루 넘었는데, 그 뒤로 시도는 있었다.
//   const stale = !h.lastSuccessAt || now - h.lastSuccessAt > 24 * 3600_000;
//   return stale && h.lastAttemptAt !== null && h.consecutiveFailures > 0;
// }
// [개선] 같은 이름으로 core 식을 부른다(SyncHealthBanner 등 호출부는 그대로).
/** 백업이 멈췄다고 **경고할** 때인가 — 식은 core/src/domain/syncStall.ts(서버 IsStalled 와 같은 경계 표). */
export function isBackupStalled(h: SyncHealth, now = Date.now()): boolean {
  return isBackupStalledCore(h, now);
}
