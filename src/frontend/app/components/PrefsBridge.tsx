"use client";
// @plm SRS-053  설정 다리 — 프로필(app_prefs)과 이 기기 localStorage를 잇는다
//
// 프로필이 바뀔 때마다(다른 기기에서 받은 값 포함) 동기 대상 설정을 localStorage로 내린다.
// 프로필에 아직 아무 값이 없고 이 기기에만 값이 있으면 — 예전 버전에서 쓰던 기기다 — 그 값을 한 번 올린다.
// 앞 세션에서 바꾼 설정이 프로필·디스크에 닿기 전에 닫혔으면(쓰기 대기 표식이 남음) 처음에 한 번 마무리한다 —
// 그 키는 마무리될 때까지 프로필 값으로 덮지 않는다(applyProfilePrefs · 되돌림 경합 2026-10-27).
// 화면은 그리지 않는다.
import { useEffect } from "react";
import { queryLocalUser } from "@app/core/data/userRepository";
import { applyProfilePrefs, localSyncedPrefs, resumePendingPrefs, writeToProfile } from "@/lib/prefs";

export function PrefsBridge() {
  useEffect(() => {
    void resumePendingPrefs().catch(() => {
      // 표식이 남는다 — 다음 부팅에 다시 마무리한다.
    });
    const sub = queryLocalUser()
      .observeWithColumns(["app_prefs"])
      .subscribe((rows) => {
        const u = rows[0];
        if (!u) return;
        const prefs = u.appPrefs;
        if (prefs && Object.keys(prefs).length) {
          applyProfilePrefs(prefs);
          return;
        }
        const local = localSyncedPrefs();
        if (Object.keys(local).length) void writeToProfile(local).catch(() => undefined);
      });
    return () => sub.unsubscribe();
  }, []);
  return null;
}
