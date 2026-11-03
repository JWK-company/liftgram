"use client";
// 프로필 설정 줄 — 잠금화면 운동 카드(SPEC-017 §11 · SRS-096). 앱 껍데기(플러그인 있음)에서만 보인다 · 웹 브라우저에서는 아무것도 그리지 않는다.
// 알림이 꺼져 있으면 카드 자체가 없으므로 「꺼짐 — 켜기」로 시스템 설정을 연다. 정확한 알람이 꺼져 있으면 휴식 끝 소리가 늦을 수 있다고 알린다.
// ProfileClient 에는 이 줄을 끼우는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { lock, lockAvailable, lockInfo, onAppState } from "@/lib/native";
import { useToast } from "../Toast";
import { ListRow } from "../ui/rows";

type LockRowState = {
  notifications: boolean | null;
  exactAlarm: boolean | null;
  lockScreen: boolean | null;
  fullScreen: boolean | null;
  overlay: boolean | null;
  battery: boolean | null;
  diag: string[];
};

const SWITCH_ROW =
  "flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)] text-left active:bg-(--color-surface-alt) focus-visible:outline-2 focus-visible:outline-(--color-brand)";

export function LockScreenRow() {
  // [원본] useState<{ notifications; exactAlarm } | null> — SPEC-019 에서 잠금 운동 화면 두 값을 더함
  const [state, setState] = useState<LockRowState | null>(null);
  const [busy, setBusy] = useState(false);
  // 연타 막기는 ref 로(상태는 다음 그림까지 늦다) · 토글 중 시작된 읽기는 옛 값이라 버린다(REV-015 화면 #9)
  const busyRef = useRef(false);
  const writeGen = useRef(0);
  const toast = useToast();
  useEffect(() => {
    if (!lockAvailable()) return;
    let alive = true;
    const read = () => {
      const gen = writeGen.current;
      void lockInfo().then((r) => {
        if (alive && !busyRef.current && gen === writeGen.current)
          setState({
            notifications: r.notifications,
            exactAlarm: r.exactAlarm,
            lockScreen: r.lockScreen,
            fullScreen: r.fullScreen,
            overlay: r.overlay,
            battery: r.battery,
            diag: r.diag,
          });
      });
    };
    read();
    // 설정 화면에서 돌아오면 다시 읽는다
    const onVis = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVis);
    // 안드로이드 웹뷰는 설정 화면에서 돌아와도 visibilitychange 가 안 올 때가 있어 앱 상태로도 읽는다(REV-007 화면 M-7)
    let sub: { remove: () => unknown } | null = null;
    void onAppState((active) => active && read()).then((l) => {
      if (alive) sub = l;
      else void l?.remove();
    });
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void sub?.remove();
    };
  }, []);
  if (!state || state.notifications == null) return null;
  const toggleLockScreen = async () => {
    if (busyRef.current || state.lockScreen == null) return;
    const next = !state.lockScreen;
    busyRef.current = true;
    writeGen.current += 1;
    setBusy(true);
    try {
      const r = await lock.setLockScreen(next);
      if (r) setState((s) => (s ? { ...s, lockScreen: next } : s));
    } catch {
      toast(t("profile.lockScreenFailed")); // 상태는 그대로(실제 설정과 같게)
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <ListRow
        testId="row-lock-card"
        title={t("profile.lockCard")}
        value={state.notifications ? t("profile.lockOn") : t("profile.lockOffEnable")}
        onPress={() => void lock.openSettings("notifications")}
      />
      {state.notifications && state.exactAlarm === false ? (
        <ListRow
          testId="row-lock-exact"
          title={t("profile.lockExactAlarm")}
          value={t("profile.lockExactOff")}
          onPress={() => void lock.openSettings("exactAlarm")}
        />
      ) : null}
      {/* 잠금화면 위 운동 화면(SPEC-019 · 안드로이드 1.3.0+) — 켜기·끄기는 스위치(REV-014 #12) */}
      {state.notifications && state.lockScreen != null ? (
        <button
          type="button"
          role="switch"
          aria-checked={state.lockScreen}
          aria-busy={busy}
          aria-label={t("profile.lockScreen")}
          aria-describedby="lock-screen-hint"
          data-testid="row-lock-screen"
          onClick={() => void toggleLockScreen()}
          className={SWITCH_ROW}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
              {t("profile.lockScreen")}
            </span>
            <span
              id="lock-screen-hint"
              className="break-words text-(--color-ink2) text-[length:var(--text-sm)]"
            >
              {t("profile.lockScreenHint")}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-(--color-ink2) text-[length:var(--text-sm)]">
            {state.lockScreen ? t("profile.lockOn") : t("profile.lockOff")}
          </span>
        </button>
      ) : null}
      {/* 빠진 허용 진단(SPEC-020) — 효과가 큰 「다른 앱 위에 표시」를 위에 · 보조 글로 두 줄을 구별 */}
      {state.notifications && state.lockScreen && state.overlay === false ? (
        <ListRow
          testId="row-lock-overlay"
          title={t("profile.lockOverlay")}
          subtitle={t("profile.lockOverlayHint")}
          wrapSubtitle
          // 값 칸 대신 꺾쇠 — 긴 제목(영어)이 좁은 폭에서 잘리지 않게(REV-017 웹 #4) · 할 일은 보조 글이 말한다
          chevron
          onPress={() => {
            toast(t("profile.lockOverlayGuide"));
            void lock.openSettings("overlay");
          }}
        />
      ) : null}
      {state.notifications && state.lockScreen && state.fullScreen === false ? (
        <ListRow
          testId="row-lock-fullscreen"
          title={t("profile.lockScreenPermission")}
          // [개선] SPEC-020 — 보조 글로 「다른 앱 위에 표시」 줄과 구별
          subtitle={t("profile.lockScreenPermissionHint")}
          wrapSubtitle
          value={t("profile.lockScreenNeedsPermission")}
          onPress={() => void lock.openSettings("fullScreen")}
        />
      ) : null}
      {state.notifications && state.lockScreen && state.battery === false ? (
        <ListRow
          testId="row-lock-battery"
          title={t("profile.lockBattery")}
          subtitle={t("profile.lockBatteryHint")}
          wrapSubtitle
          chevron
          onPress={() => void lock.openSettings("battery")}
        />
      ) : null}
      {/* 진단 기록(SPEC-020) — 실기기에서 왜 안 떴는지 보이게(화면 꺼짐·켜짐 · 고른 길 · 결과). 운동 이름·값은 없다.
          알림이 꺼져 있어도 보인다(일부러 — 원인 확인용) · 기록 문구는 네이티브 한국어 고정(개발 진단용 · REV-017 웹 #5 보류) */}
      {state.lockScreen && state.diag.length > 0 ? (
        <details data-testid="row-lock-diag" className="px-[var(--spacing-lg)] py-[var(--spacing-md)]">
          <summary className="min-h-[44px] cursor-pointer focus-visible:outline-2 focus-visible:outline-(--color-brand) py-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]">
            {t("profile.lockDiag")}
          </summary>
          <pre className="whitespace-pre-wrap break-words text-(--color-ink2) text-[length:var(--text-xs)]">
            {state.diag.slice().reverse().join("\n")}
          </pre>
        </details>
      ) : null}
    </>
  );
}
