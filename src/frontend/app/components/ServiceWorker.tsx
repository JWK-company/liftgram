"use client";
// @plm SRS-051 SRS-085  서비스워커 등록 · 새 버전 추적 · 업데이트 덮개 · 저장소 보존 요청
//
// 운영 빌드에서만 등록한다 — 개발 서버에 붙으면 HMR과 캐시가 엉켜 고친 코드가 안 보인다.
//
// [원본] 새 버전은 운동 중이 아니면 곧바로 적용했다(2026-10-27). 운동 세션이 진행 중이면 띠도 띄우지 않았다.
// [개선 2026-10-27 · SRS-085] 새 버전은 **프로필 「업데이트」를 누를 때만** 적용한다. 하단 띠·자동 적용·/workout 보류는 걷어냈다
// (옛 구현은 2026-11-09 지웠다 — git 기록 e288d7b 판에 있다). 이 컴포넌트는 워커를 등록·추적해 lib/appUpdate 저장소에 적고, 덮개를 그리고, 필수 업데이트만 스스로 시작한다.
// 앱을 완전히 닫았다 열면 브라우저가 기다리던 워커를 활성화한다 — 새 문서가 처음부터 새 워커라 새로고침이 없다(허용).
// 다른 탭이 적용해 controllerchange 가 와도 이 탭은 새로고침하지 않는다(「업데이트」= 새로고침만으로 표시).
//
// `navigator.storage.persist()`: Safari는 홈 화면에 추가하지 않은 사이트의 저장소를 7일 방문이
// 없으면 지운다. 기록이 기기 DB에 있으니 보존을 요청해 둔다(거절돼도 동작은 같다).
// [개선] 수동 업데이트(SRS-085) — 판정은 core, 상태·절차는 lib/appUpdate
import { mandatoryUpdateAction } from "@app/core/domain/swUpdatePolicy";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  APP_VERSION,
  attachRegistration,
  checkServerVersion,
  finishBootCover,
  getAppUpdateState,
  initUpdateTracking,
  // onControllerChange, // [원본] 버전을 보지 않고 「표시」 — 같은 버전 대기 워커에도 알림이 남았다(2026-10-30)
  onControllerChangeChecked,
  resetDismissedOnVisible,
  // setWaiting, // [원본]
  setWaitingChecked,
  startUpdate,
  useAppUpdate,
} from "@/lib/appUpdate";
import { UpdateOverlay } from "./UpdateOverlay";
import { useSession } from "./SessionProvider";

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
      // [원본] if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      // [개선] 대기 워커가 지금 문서와 같은 버전이면 알리지 않고 조용히 넘긴다 @plm SRS-085
      if (reg.waiting && navigator.serviceWorker.controller) setWaitingChecked(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          // [원본] … setWaiting(sw);
          if (!cancelled && sw.state === "installed" && navigator.serviceWorker.controller)
            setWaitingChecked(sw);
        });
      });
    };
    navigator.serviceWorker
      .register("/sw.js")
      .then(track)
      .catch(() => {});

    // [원본] const act = controllerChangeAction({ hadController, reloaded, pathname: pathRef.current }); … reload / defer
    // [개선] 누른 업데이트일 때만 새로고침 — 그 밖(첫 설치·다른 탭·브라우저 활성화)은 새로고침하지 않는다
    // [원본] navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChangeChecked);

    // 화면이 다시 보이면: 서버 최소 버전(60초 간격) · 새 버전 받아 두기(10분 간격 — 적용은 하지 않는다 · QA L-3)
    void checkServerVersion(true);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      resetDismissedOnVisible(); // 필수 업데이트를 닫았어도 다음 보임에 다시(QA code L-1 · 스펙 §6)
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
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChangeChecked);
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
