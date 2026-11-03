"use client";
// SPEC-018 §6·§8  지금 이 사람에게 무엇을 권할지(update · reinstall · switch · none) — 배너·프로필 카드가 같이 쓴다
//
// 셸·최신판은 마운트 때 한 번, 화면이 다시 보일 때(설정·설치에서 돌아옴) 다시 읽는다.
// 판정은 core decideOffer(순수). 배너만 「나중에」를 넘기고, 프로필 카드는 넘기지 않는다(늘 보인다).
import { type Latest, type Offer, type Shell, decideOffer } from "@app/core/domain/appDistribution";
import { useCallback, useEffect, useState } from "react";
import { type NativeInfo, fetchLatest, readDismissed, readShell } from "@/lib/appDistribution";
import { useAuth } from "../AuthProvider";
import { useSession } from "../SessionProvider";

export type AppOfferState = {
  loaded: boolean;
  shell: Shell | null;
  info: NativeInfo | null;
  latest: Latest | null;
  offer: Offer;
  reload: () => void;
};

const NONE: Offer = { kind: "none", why: "loading" };

export function useAppOffer({ withDismiss }: { withDismiss: boolean }): AppOfferState {
  const { user, loading } = useAuth();
  const { activeWorkoutId, activeLoaded } = useSession();
  const [data, setData] = useState<{ shell: Shell; info: NativeInfo | null; latest: Latest | null } | null>(
    null,
  );
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      // [원본] const [s, latest] = await Promise.all([readShell(), fetchLatest(tick > 0)]);
      // [개선 REV-013 화면 L-1] 안드로이드가 아니면(데스크톱·iOS 웹·iOS 앱) json 을 받지 않는다 — 판정이 늘 none
      const s = await readShell();
      const latest = s.shell.os === "android" ? await fetchLatest(tick > 0) : null;
      if (live) setData({ shell: s.shell, info: s.info, latest });
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  // 다 받은 뒤에만 판정한다(로그인 확인 · 진행 중 운동 읽기 · 셸 · 최신판) — 깜빡임 금지
  const loaded = !!data && !loading && activeLoaded;
  const offer =
    loaded && data
      ? decideOffer(data.shell, data.latest, {
          activeWorkout: !!activeWorkoutId,
          loggedIn: !!user,
          dismissed: withDismiss ? readDismissed() : null,
          now: Date.now(),
        })
      : NONE;
  return {
    loaded,
    shell: data?.shell ?? null,
    info: data?.info ?? null,
    latest: data?.latest ?? null,
    offer,
    reload,
  };
}
