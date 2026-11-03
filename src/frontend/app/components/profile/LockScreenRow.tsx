"use client";
// 프로필 설정 줄 — 잠금화면 운동 카드(SPEC-017 §11 · SRS-096). 앱 껍데기(플러그인 있음)에서만 보인다 · 웹 브라우저에서는 아무것도 그리지 않는다.
// 알림이 꺼져 있으면 카드 자체가 없으므로 「꺼짐 — 켜기」로 시스템 설정을 연다. 정확한 알람이 꺼져 있으면 휴식 끝 소리가 늦을 수 있다고 알린다.
// ProfileClient 에는 이 줄을 끼우는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { lock, lockAvailable, lockInfo, onAppState } from "@/lib/native";
import { ListRow } from "../ui/rows";

export function LockScreenRow() {
  const [state, setState] = useState<{ notifications: boolean | null; exactAlarm: boolean | null } | null>(
    null,
  );
  useEffect(() => {
    if (!lockAvailable()) return;
    let alive = true;
    const read = () =>
      void lockInfo().then((r) => {
        if (alive) setState({ notifications: r.notifications, exactAlarm: r.exactAlarm });
      });
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
    </>
  );
}
