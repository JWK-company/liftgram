"use client";
// @plm SRS-011  설정 다리 — 프로필(app_prefs)과 이 기기 localStorage를 잇는다
//
// 프로필이 바뀔 때마다(다른 기기에서 받은 값 포함) 동기 대상 설정을 localStorage로 내린다.
// 프로필에 아직 아무 값이 없고 이 기기에만 값이 있으면 — 예전 버전에서 쓰던 기기다 — 그 값을 한 번 올린다.
// 화면은 그리지 않는다.
import { useEffect } from "react";
import { queryLocalUser } from "@app/core/data/userRepository";
import { applyProfilePrefs, localSyncedPrefs, writeToProfile } from "@/lib/prefs";

export function PrefsBridge() {
  useEffect(() => {
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
        if (Object.keys(local).length) void writeToProfile(local);
      });
    return () => sub.unsubscribe();
  }, []);
  return null;
}
