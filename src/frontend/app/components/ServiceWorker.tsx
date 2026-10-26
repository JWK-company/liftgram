"use client";
// @plm SRS-051  서비스워커 등록 · 새 버전 띠 · 저장소 보존 요청
//
// 운영 빌드에서만 등록한다 — 개발 서버에 붙으면 HMR과 캐시가 엉켜 고친 코드가 안 보인다.
//
// 새 버전은 **사람이 눌러야** 적용된다(설계안 결정 2A). 운동 세션이 진행 중이면 띠를 띄우지 않는다:
// 세트를 적는 도중 새로고침되면 안 되기 때문이다. 세션이 끝나면 그때 뜬다. 다음에 앱을 새로 열면
// 브라우저가 알아서 새 워커로 바꾸므로, 끝내 누르지 않아도 오래 옛 버전에 머물지는 않는다.
//
// `navigator.storage.persist()`: Safari는 홈 화면에 추가하지 않은 사이트의 저장소를 7일 방문이
// 없으면 지운다. 기록이 기기 DB에 있으니 보존을 요청해 둔다(거절돼도 동작은 같다).
import { useEffect, useState } from "react";
import { tw } from "@/lib/i18n";
import { useSession } from "./SessionProvider";

export function ServiceWorker() {
  const { activeWorkoutId } = useSession();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.storage?.persist?.().catch(() => {});

    let cancelled = false;
    const track = (reg: ServiceWorkerRegistration) => {
      // 이미 기다리는 워커가 있으면(다른 탭에서 받아 둔 것) 바로 띠를 띄울 후보다.
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          // controller가 없으면 첫 설치다 — 바꿀 옛 버전이 없으니 띠를 띄우지 않는다.
          if (!cancelled && sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    };
    navigator.serviceWorker
      .register("/sw.js")
      .then(track)
      .catch(() => {});

    // 새 워커가 자리를 잡으면 한 번만 새로고침한다(새 화면 조각과 맞추려면 페이지도 새것이어야 한다).
    // **처음 설치는 빼고** — 옛 워커가 없던 첫 방문에서 clients.claim 이 자리를 잡을 때도 controllerchange 가 오는데,
    // 그때 새로고침하면 사용자가 막 누른 화면 이동이 홈 새로고침에 끊긴다(바꿀 옛 버전이 없으니 새로고침할 이유도 없다 ·
    // 2026-10-26 운영 offline e2e 에서 「/exercises 이동이 / 새로고침에 끊김」 으로 재현).
    const hadController = navigator.serviceWorker.controller != null;
    let reloaded = false;
    const onChange = () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
  }, []);

  if (!waiting || activeWorkoutId) return null;

  return (
    <div
      role="status"
      data-testid="sw-update"
      className="fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-[528px] items-center justify-between gap-3 rounded-lg border border-(--color-line) bg-(--color-card) px-4 py-3 text-sm shadow-lg"
    >
      <span>{tw("web.sw.updateReady")}</span>
      <button
        type="button"
        data-testid="sw-update-apply"
        className="rounded-md bg-(--color-brand) px-3 py-1.5 font-semibold text-(--color-on-brand)"
        onClick={() => waiting.postMessage("skip-waiting")}
      >
        {tw("web.sw.updateApply")}
      </button>
    </div>
  );
}
