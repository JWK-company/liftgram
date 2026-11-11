"use client";
// 운동 중 화면 위 「잠금화면 운동 화면 준비」 안내(2026-11-04 실기기 피드백 — 권한 요청이 안 보이고 카드도 안 뜸)
//
// 왜: 알림 권한은 네이티브가 첫 운동 때 시스템 창으로 **한 번만** 물었다(askNotificationsOnce). 한 번 닫거나 거부하면 다시 묻지 않고,
// 빠진 허용은 프로필 깊은 곳에서만 보였다 → 사용자는 「아무 말도 없이 카드가 안 뜬다」만 겪었다.
// 그래서 운동 중일 때 빠진 허용을 여기서 곧바로 알리고, 누르면 그 설정 화면을 연다. 설정에서 돌아오면 다시 읽어 사라진다.
// 잠금 운동 화면을 프로필에서 일부러 끈 사용자(lockScreen false)에게는 보이지 않는다 · 웹 브라우저(다리 없음)에서도 안 보인다.
// 「이번 운동에서 숨기기」는 운동 id 별로 sessionStorage 에 둔다(다음 운동에서는 다시 알린다).
import { useCallback, useEffect, useRef, useState } from "react";
import { type TransKey, t } from "@/lib/i18n";
import { lock, lockAvailable, lockInfo, onAppState } from "@/lib/native";
import { useSession } from "../SessionProvider";
import { useToast } from "../Toast";
import { AppText } from "../ui/primitives";
import { actionBoxClass, touchPad } from "../ui/Button";

type Info = Awaited<ReturnType<typeof lockInfo>>;
type Kind = "notifications" | "fullScreen" | "overlay" | "battery";

const HIDE_KEY = "liftgram.lockReady.hidden";

/**
 * 꼭 필요한데 빠진 허용만(REV-019 M-1·M-2 — 과한 조르기를 하지 않는다).
 * - 알림이 꺼져 있으면 알림 하나만 — 카드가 아예 없고, 전체 화면 허용은 알림이 꺼지면 늘 false 라 거짓 양성이다(LockScreenGate.fullScreenAllowed).
 * - 「다른 앱 위에 표시」와 「전체 화면 알림」은 서로의 대체 길이다(LockScreenGate — 화면 꺼짐·휴식 끝 둘 다 한쪽만 있어도 뜬다) → 둘 다 없을 때만.
 * - 배터리는 포그라운드 서비스(SPEC-020)가 있어 선택 — 프로필 줄에만 둔다.
 * - 옛 앱(lockScreen null — 잠금 운동 화면 없음)에는 알림(카드)만 · 잠금 운동 화면을 끈 사용자에게는 아무것도.
 */
export function missingLockPermissions(i: Pick<Info, Kind | "lockScreen">): Kind[] {
  if (i.lockScreen === false) return []; // 사용자가 끈 기능은 조르지 않는다
  if (i.notifications === false) return ["notifications"];
  if (i.lockScreen !== true) return [];
  if (i.overlay === false && i.fullScreen === false) return ["overlay", "fullScreen"];
  return [];
}

const LABEL: Record<Kind, TransKey> = {
  notifications: "session.lockReadyNotif",
  overlay: "session.lockReadyOverlay",
  fullScreen: "session.lockReadyFullScreen",
  battery: "session.lockReadyBattery",
};

function readHidden(): string | null {
  try {
    return sessionStorage.getItem(HIDE_KEY);
  } catch {
    return null;
  }
}

export function LockReadiness() {
  const { activeWorkoutId } = useSession();
  const [info, setInfo] = useState<Info | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const toast = useToast();

  // 늦게 끝난 옛 읽기가 새 값을 덮지 않게 — 세대 번호(REV-019 L-2)
  const gen = useRef(0);
  const read = useCallback(() => {
    const g = ++gen.current;
    void lockInfo()
      .then((r) => {
        if (g === gen.current) setInfo(r);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeWorkoutId || !lockAvailable()) return;
    setHidden(readHidden());
    read();
    // 설정 화면에서 돌아오면 다시 읽는다(웹뷰는 visibilitychange 가 안 올 때가 있어 앱 상태로도 — REV-007 화면 M-7)
    const onVis = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVis);
    let alive = true;
    let sub: { remove: () => unknown } | null = null;
    void onAppState((active) => active && read()).then((l) => {
      if (alive) sub = l;
      else void l?.remove();
    });
    return () => {
      alive = false;
      gen.current += 1; // 정리 뒤 도착한 응답은 버린다
      document.removeEventListener("visibilitychange", onVis);
      void sub?.remove();
    };
  }, [activeWorkoutId, read]);

  if (!activeWorkoutId || !info || info.notifications == null) return null;
  if (hidden === activeWorkoutId) return null;
  const missing = missingLockPermissions(info);
  if (!missing.length) return null;

  const open = (k: Kind) => {
    if (k === "overlay") toast(t("profile.lockOverlayGuide"));
    void lock.openSettings(k).catch(() => toast(t("session.lockReadyOpenFailed")));
  };
  const hide = () => {
    try {
      sessionStorage.setItem(HIDE_KEY, activeWorkoutId);
    } catch {
      // 숨김이 이 화면 안으로 줄어든다
    }
    setHidden(activeWorkoutId);
  };

  return (
    <section
      data-testid="lock-readiness"
      data-missing={missing.join(",")}
      aria-labelledby="lock-readiness-title"
      className="mx-[var(--spacing-lg)] mt-[var(--spacing-sm)] rounded-[var(--radius-sm)] border border-(--color-warn) bg-(--color-card) p-[var(--spacing-sm)]"
    >
      <AppText variant="caption" className="block font-bold" id="lock-readiness-title">
        {t("session.lockReadyTitle")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="block" role="status">
        {missing.includes("notifications") ? t("session.lockReadyBodyNotif") : t("session.lockReadyBody")}
      </AppText>
      <div className="mt-[6px] flex flex-wrap gap-[var(--spacing-xs)]">
        {missing.map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`lock-readiness-${k}`}
            onClick={() => open(k)}
            className="min-h-[44px] rounded-[var(--radius-sm)] border border-(--color-line) px-[var(--spacing-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand)"
          >
            <AppText variant="caption" className="font-bold">
              {t(LABEL[k])}
            </AppText>
          </button>
        ))}
        <button
          type="button"
          data-testid="lock-readiness-hide"
          onClick={hide}
          // [원본] className="min-h-[44px] px-[var(--spacing-sm)] …" + 흐린 글자(SPEC-061)
          className={`${actionBoxClass()} ${touchPad} min-h-[40px] px-[var(--spacing-md)] focus-visible:outline-2 focus-visible:outline-(--color-brand)`}
        >
          <AppText variant="caption" className="font-semibold">
            {t("session.lockReadyHide")}
          </AppText>
        </button>
      </div>
    </section>
  );
}
