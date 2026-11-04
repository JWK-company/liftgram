"use client";
// 잠금화면 운동 카드 다리를 셸에 건다(SPEC-017 Phase 3 · SRS-096) — 세션 화면이 안 떠 있어도 스냅샷·drain 이 돈다.
// 다리가 없으면(웹 브라우저) 아무 호출도 하지 않는다. 첫 화면 준비 신호(부팅 덮개)도 여기서 낸다.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { useToast } from "./Toast";
import { t } from "@/lib/i18n";
import { markFirstScreenReady, onWorkoutDeepLink } from "@/lib/native";
import { E2E_FAULTS } from "@/lib/e2eFlags";

export function LockBridge() {
  const { getRestState, mergeRemoteRest, activeLoaded } = useSession();
  const toast = useToast();
  const [lockReady, setLockReady] = useState(false);
  const router = useRouter();

  // 잠금 카드 「앱 열기」 → 운동 화면(REV-008 화면 M-9)
  useEffect(() => {
    let sub: { remove: () => unknown } | null = null;
    let alive = true;
    // [원본] void onWorkoutDeepLink(() => router.push("/workout")).then((l) => {
    // [개선] 이미 운동 화면이어도 push 하면 스크롤이 맨 위로 갔다 — 그때는 이동하지 않고, 어느 쪽이든 지금 하는 종목을 보여 준다
    void onWorkoutDeepLink(() => {
      if (location.pathname.replace(/\/$/, "") !== "/workout") router.push("/workout");
      void import("@/lib/lockBridge").then((m) => m.focusCurrentExercise());
    }).then((l) => {
      if (alive) sub = l;
      else void l?.remove();
    });
    return () => {
      alive = false;
      void sub?.remove();
    };
  }, [router]);

  useEffect(() => {
    // e2e 빌드 표식(결함 주입 테스트가 빌드 종류를 안다 · 운영 빌드에서는 접힌다)
    if (E2E_FAULTS) document.documentElement.dataset.e2eFaults = "1";
    let off = () => {};
    let offReady = () => {};
    let alive = true;
    void import("@/lib/lockBridge").then((m) => {
      if (!alive) return;
      offReady = m.subscribeLockReady(setLockReady);
      off = m.startLockBridge({
        getRest: getRestState,
        mergeRest: mergeRemoteRest,
        onDiscarded: (n) => toast(t("session.lockDiscarded", { count: n })),
      });
    });
    return () => {
      alive = false;
      off();
      offReady();
    };
  }, [getRestState, mergeRemoteRest, toast]);

  // 첫 화면 준비 = 활성 운동 읽기 끝 + (앱이면) 첫 drain 끝 — 부팅 덮개가 이것을 기다린다(REV-004 웹 M-2)
  useEffect(() => {
    if (activeLoaded && lockReady) markFirstScreenReady();
  }, [activeLoaded, lockReady]);

  return null;
}
