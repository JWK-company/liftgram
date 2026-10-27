// @plm SRS-084 SRS-051  새 버전(서비스워커) 자동 적용 판정 — 화면(ServiceWorker.tsx)이 부르는 순수 함수
//
// 2026-10-27 피드백 #64: 운동을 완료하면 셸의 진행 중 운동이 곧바로 null 이 되어 「운동 중 아님」으로 보였고,
// 기다리던 새 워커에 skip-waiting → controllerchange → 새로고침이 일어나 요약·「바뀐 루틴 저장」 시트가 날아갔다.
// 요약·완료 시트는 셸이 모르는 「결정 중」 상태라, 셸이 확실히 아는 값(경로)으로 보류한다:
// 운동 화면(/workout)에 있는 동안은 적용·새로고침을 미루고, 떠나면(요약 닫기 → 홈) 그때 한다.

/** 새 버전 적용을 미루는 경로 — 운동 화면(진행 중·요약·완료 시트가 모두 여기서 그려진다). */
export function isUpdateHoldPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/)[0];
  return path === '/workout' || path.startsWith('/workout/');
}

/** 기다리는 새 워커를 지금 곧바로 적용해도 되는가(기기 DB 의 진행 중 운동 확인은 화면이 따로 한다). */
export function shouldAutoApplyUpdate(input: {
  hasWaiting: boolean;
  activeWorkoutId: string | null | undefined;
  pathname: string | null | undefined;
}): boolean {
  return input.hasWaiting && !input.activeWorkoutId && !isUpdateHoldPath(input.pathname);
}

/**
 * 새 워커가 자리를 잡았을 때(controllerchange) — 첫 설치·이미 새로고침했으면 무시, 운동 화면이면 미룸(떠날 때 새로고침),
 * 그 밖은 곧바로 새로고침. 다른 탭이 새 버전을 적용해도 이 탭의 요약이 날아가지 않게.
 */
export function controllerChangeAction(input: {
  hadController: boolean;
  reloaded: boolean;
  pathname: string | null | undefined;
}): 'ignore' | 'defer' | 'reload' {
  if (input.reloaded || !input.hadController) return 'ignore';
  return isUpdateHoldPath(input.pathname) ? 'defer' : 'reload';
}
