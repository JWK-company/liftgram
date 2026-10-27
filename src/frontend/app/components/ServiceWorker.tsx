"use client";
// @plm SRS-051 SRS-085  서비스워커 등록 · 새 버전 추적 · 업데이트 덮개 · 저장소 보존 요청
//
// 운영 빌드에서만 등록한다 — 개발 서버에 붙으면 HMR과 캐시가 엉켜 고친 코드가 안 보인다.
//
// [원본] 새 버전은 운동 중이 아니면 곧바로 적용한다(2026-10-27 — 아래 useEffect). 운동 세션이 진행 중이면 띠도 띄우지 않는다.
// [개선 2026-10-27 · SRS-085] 새 버전은 **프로필 「업데이트」를 누를 때만** 적용한다. 하단 띠·자동 적용·/workout 보류는 걷어냈다
// (아래 주석 처리). 이 컴포넌트는 워커를 등록·추적해 lib/appUpdate 저장소에 적고, 덮개를 그리고, 필수 업데이트만 스스로 시작한다.
// 앱을 완전히 닫았다 열면 브라우저가 기다리던 워커를 활성화한다 — 새 문서가 처음부터 새 워커라 새로고침이 없다(허용).
// 다른 탭이 적용해 controllerchange 가 와도 이 탭은 새로고침하지 않는다(「업데이트」= 새로고침만으로 표시).
//
// `navigator.storage.persist()`: Safari는 홈 화면에 추가하지 않은 사이트의 저장소를 7일 방문이
// 없으면 지운다. 기록이 기기 DB에 있으니 보존을 요청해 둔다(거절돼도 동작은 같다).
// [원본] 자동 적용·/workout 보류·미룬 새로고침 판정 — 아래 주석 처리한 effect 들이 썼다(원복 시 함께 되살린다)
// import {
//   controllerChangeAction,
//   isUpdateHoldPath,
//   shouldAutoApplyUpdate,
// } from "@app/core/domain/swUpdatePolicy";
// [개선] 수동 업데이트(SRS-085) — 판정은 core, 상태·절차는 lib/appUpdate
import { mandatoryUpdateAction } from "@app/core/domain/swUpdatePolicy";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
// import { useState } from "react"; — [원본] waiting·pendingReload 상태는 lib/appUpdate 저장소로 옮겼다
// import { tw } from "@/lib/i18n"; — [원본] 하단 띠 문구
import {
  APP_VERSION,
  attachRegistration,
  checkServerVersion,
  finishBootCover,
  getAppUpdateState,
  initUpdateTracking,
  onControllerChange,
  setWaiting,
  startUpdate,
  useAppUpdate,
} from "@/lib/appUpdate";
import { UpdateOverlay } from "./UpdateOverlay";
import { useSession } from "./SessionProvider";

// [원본] 띠·자동 적용·/workout 보류 — 원복 시 아래를 주석 해제하고 위 import 를 되돌린 뒤 [개선] 함수를 주석 처리한다
// export function ServiceWorker() {
//   const { activeWorkoutId } = useSession();
//   const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
//   // 운동 화면(/workout — 진행 중·요약·완료 시트)에 있는 동안은 새 버전 적용·새로고침을 미룬다(피드백 #64) @plm SRS-084
//   // 완료 순간 셸의 진행 중 운동은 null 이 되지만, 사람은 아직 요약·「바뀐 루틴 저장」을 보고 고르는 중이다.
//   const pathname = usePathname();
//   const pathRef = useRef(pathname);
//   pathRef.current = pathname;
//   const [pendingReload, setPendingReload] = useState(false);
//
//   useEffect(() => {
//     if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
//     void navigator.storage?.persist?.().catch(() => {});
//
//     let cancelled = false;
//     const track = (reg: ServiceWorkerRegistration) => {
//       // 이미 기다리는 워커가 있으면(다른 탭에서 받아 둔 것) 바로 띠를 띄울 후보다.
//       if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
//       reg.addEventListener("updatefound", () => {
//         const sw = reg.installing;
//         sw?.addEventListener("statechange", () => {
//           // controller가 없으면 첫 설치다 — 바꿀 옛 버전이 없으니 띠를 띄우지 않는다.
//           if (!cancelled && sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
//         });
//       });
//     };
//     navigator.serviceWorker
//       .register("/sw.js")
//       .then(track)
//       .catch(() => {});
//
//     // 새 워커가 자리를 잡으면 한 번만 새로고침한다(새 화면 조각과 맞추려면 페이지도 새것이어야 한다).
//     // **처음 설치는 빼고** — 옛 워커가 없던 첫 방문에서 clients.claim 이 자리를 잡을 때도 controllerchange 가 오는데,
//     // 그때 새로고침하면 사용자가 막 누른 화면 이동이 홈 새로고침에 끊긴다(바꿀 옛 버전이 없으니 새로고침할 이유도 없다 ·
//     // 2026-10-26 운영 offline e2e 에서 「/exercises 이동이 / 새로고침에 끊김」 으로 재현).
//     const hadController = navigator.serviceWorker.controller != null;
//     let reloaded = false;
//     const onChange = () => {
//       // [원본] if (reloaded || !hadController) return; reloaded = true; window.location.reload();
//       // [개선] 운동 화면이면 미룬다 — 다른 탭이 새 버전을 적용해도 이 탭의 요약이 날아가지 않게(피드백 #64) @plm SRS-084
//       const act = controllerChangeAction({ hadController, reloaded, pathname: pathRef.current });
//       if (act === "ignore") return;
//       reloaded = true;
//       if (act === "defer") setPendingReload(true);
//       else window.location.reload();
//     };
//     navigator.serviceWorker.addEventListener("controllerchange", onChange);
//     return () => {
//       cancelled = true;
//       navigator.serviceWorker.removeEventListener("controllerchange", onChange);
//     };
//   }, []);
//
//   // ── 운동 중이 아니면 새 버전을 **곧바로** 적용한다 (2026-10-27) ──
//   // 띠를 사람이 누를 때까지 기다렸더니, 누르지 않은 기기는 새로고침할 때마다 기기에 남은 옛 화면을 먼저 그렸다
//   // (지운 「진행 중인 운동 · 빠른 운동 시작」 빈 화면이 당겨서 새로고침 때 잠깐 보였다 — 피드백 #61 후속).
//   // 세트를 적는 도중 새로고침하지 않는다는 원칙은 그대로 — 진행 중인 운동이 있으면 끝날 때까지 기다린다.
//   // 운동 여부는 셸 상태가 아니라 **기기 DB** 로 본다(부팅 직후 셸 상태는 아직 비어 있을 수 있다).
//   // 미뤄 둔 새로고침 — 운동 화면을 떠나면(요약 닫기 → 홈) 그때 한 번 @plm SRS-084
//   // [원본] if (pendingReload && !isUpdateHoldPath(pathname)) window.location.reload();
//   // [개선] 새로고침 전에 기기 DB 를 내려쓰고, 진행 중 운동이 있으면 계속 미룬다(그대로 다시 시작 → 홈에 잠깐 나간 경우 · /qa code L-3)
//   useEffect(() => {
//     if (!pendingReload || isUpdateHoldPath(pathname) || activeWorkoutId) return;
//     let stop = false;
//     void (async () => {
//       try {
//         const repo = await import("@app/core/data/workoutRepository");
//         if (stop || (await repo.getActiveWorkout())) return;
//         const { flushLocalDb } = await import("@/lib/localDb");
//         await flushLocalDb();
//       } catch {
//         // 확인하지 못해도 예전처럼 새로고침한다(떠난 화면이다)
//       }
//       if (!stop) window.location.reload();
//     })();
//     return () => {
//       stop = true;
//     };
//   }, [pendingReload, pathname, activeWorkoutId]);
//
//   useEffect(() => {
//     // [원본] if (!waiting || activeWorkoutId) return;
//     // [개선] 운동 화면(요약·완료 시트 포함)에서는 적용하지 않는다 — 떠나면 경로가 바뀌어 다시 판단한다(피드백 #64) @plm SRS-084
//     if (!waiting || !shouldAutoApplyUpdate({ hasWaiting: true, activeWorkoutId, pathname })) return;
//     let stop = false;
//     void (async () => {
//       try {
//         const repo = await import("@app/core/data/workoutRepository");
//         if (stop || (await repo.getActiveWorkout())) return;
//         const { flushLocalDb } = await import("@/lib/localDb");
//         await flushLocalDb();
//         if (!stop) waiting.postMessage("skip-waiting");
//       } catch {
//         // 확인하지 못하면 예전처럼 띠로 맡긴다.
//       }
//     })();
//     return () => {
//       stop = true;
//     };
//   }, [waiting, activeWorkoutId, pathname]);
//
//   // [원본] if (!waiting || activeWorkoutId) return null;
//   // [개선] 운동 화면에서는 띠도 띄우지 않는다 — 요약 위에서 눌러도 요약이 날아간다 @plm SRS-084
//   if (!waiting || activeWorkoutId || isUpdateHoldPath(pathname)) return null;
//
//   return (
//     <div
//       role="status"
//       data-testid="sw-update"
//       className="fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-[528px] items-center justify-between gap-3 rounded-lg border border-(--color-line) bg-(--color-card) px-4 py-3 text-sm shadow-lg"
//     >
//       <span>{tw("web.sw.updateReady")}</span>
//       <button
//         type="button"
//         data-testid="sw-update-apply"
//         className="rounded-md bg-(--color-brand) px-3 py-1.5 font-semibold text-(--color-on-brand)"
//         onClick={() => waiting.postMessage("skip-waiting")}
//       >
//         {tw("web.sw.updateApply")}
//       </button>
//     </div>
//   );
// }

// [개선] 수동 업데이트 — 등록·추적·덮개·필수 업데이트 @plm SRS-085
export function ServiceWorker() {
  const { activeWorkoutId, activeLoaded } = useSession();
  const pathname = usePathname();
  const upd = useAppUpdate();
  const lastRegUpdate = useRef(0);

  // 새로고침 직후 — 첫 칠하기 전부터 덮던 정적 덮개를 하이드레이션 뒤에 내린다(개발 서버에서도 · 표식이 남지 않게)
  useEffect(() => {
    finishBootCover();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.storage?.persist?.().catch(() => {});

    let cancelled = false;
    // 처음 로드 때 이미 옛 워커가 이 문서를 제어했는가 — 아니면 첫 설치다(바꿀 옛 버전이 없다 · 띠·점 없음)
    const hadController = navigator.serviceWorker.controller != null;
    initUpdateTracking(hadController);
    const track = (reg: ServiceWorkerRegistration) => {
      attachRegistration(reg, hadController);
      // 이미 기다리는 워커가 있으면(지난 방문에 받아 둔 것) 곧바로 「새 버전 대기」
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (!cancelled && sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    };
    navigator.serviceWorker
      .register("/sw.js")
      .then(track)
      .catch(() => {});

    // [원본] const act = controllerChangeAction({ hadController, reloaded, pathname: pathRef.current }); … reload / defer
    // [개선] 누른 업데이트일 때만 새로고침 — 그 밖(첫 설치·다른 탭·브라우저 활성화)은 새로고침하지 않는다
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // 화면이 다시 보이면: 서버 최소 버전(60초 간격) · 새 버전 받아 두기(10분 간격 — 적용은 하지 않는다 · QA L-3)
    void checkServerVersion(true);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void checkServerVersion();
      const now = Date.now();
      if (now - lastRegUpdate.current < 10 * 60_000) return;
      lastRegUpdate.current = now;
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.update())
        .catch(() => {});
    };
    lastRegUpdate.current = Date.now();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 필수 업데이트 — 서버 최소 버전보다 낮고, 운동 중·운동 화면(요약·완료 시트 포함)이 아닐 때만 같은 덮개로
  const mandatory = mandatoryUpdateAction({
    currentVersion: APP_VERSION,
    minVersion: upd.minVersion,
    serverVersion: upd.serverVersion,
    phase: upd.phase,
    dismissed: upd.dismissed,
    activeLoaded,
    activeWorkoutId,
    pathname,
  });
  useEffect(() => {
    if (mandatory !== "start") return;
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // 셸 상태가 「없음」이어도 기기 DB 는 startUpdate 가 다시 본다(진행 중이면 덮개가 이유를 보이고 멈춘다)
    if (getAppUpdateState().phase === "idle") void startUpdate();
  }, [mandatory]);

  return <UpdateOverlay />;
}
