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

// ─────────────────────────────────────────────────────────────────────────────
// @plm SRS-085  수동 업데이트 — 프로필 버튼 하나로 (2026-10-27 · 스펙 .ouroboros/docs/spec/20261027_manual-update/spec.md)
//
// 위 세 함수(자동 적용 · /workout 보류 · 미룬 새로고침)는 **화면에서 더 부르지 않는다**(코드 보존 규칙 — 원복용).
// 새 규칙: 사람이 프로필 「업데이트」를 누를 때만 적용한다. 앱을 쓰는 동안 저절로 새로고침하지 않는다.
// 예외 둘 — ① 앱을 완전히 닫았다 열 때 브라우저가 기다리던 워커를 활성화(새 문서가 처음부터 새 워커 · 새로고침 없음)
//           ② 서버가 최소 클라이언트 버전을 올렸을 때(필수) — 운동 화면 밖·운동 중 아닐 때 같은 덮개로.
// ─────────────────────────────────────────────────────────────────────────────

/** 누른 순간부터 새로고침에 이르기까지 기다리는 최대 시간 — 넘으면 실패 화면(무한 대기 금지). */
export const UPDATE_TIMEOUT_MS = 15_000;
/** 새로고침 직후 덮개 표식의 유효 시간 — 남은 표식이 앱을 가리지 않게. */
export const BOOT_MARKER_TTL_MS = 60_000;
/** sessionStorage 표식 키 — layout.tsx 의 첫 칠하기 전 스크립트와 같은 이름. */
export const BOOT_MARKER_KEY = 'liftgram.updating';

function parseVersion(v: string | null | undefined): [number, number, number] | null {
  if (!v) return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** SemVer 앞 세 자리 비교(-1·0·1). 꼬리표(-e2e 등)는 보지 않는다. 모양을 모르면 null. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): -1 | 0 | 1 | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

/** 지금 버전이 최소 버전보다 낮은가 — 최소값이 비었거나 잘못됐으면 false(잘못 적은 값으로 앱을 잠그지 않는다). */
export function isBelowMinVersion(current: string | null | undefined, min: string | null | undefined): boolean {
  return compareVersions(current, min) === -1;
}

/**
 * 새 워커가 자리를 잡았을 때(controllerchange).
 *   ignore — 첫 설치(옛 워커가 없던 문서 · clients.claim) — 바꿀 옛 버전이 없다
 *   reload — 사람이 누른(또는 필수) 업데이트 중 — 새 문서로
 *   mark   — 그 밖(다른 탭이 적용 · 브라우저가 늦게 활성화) — **새로고침하지 않고** 「새로고침하면 적용」으로 표시만
 */
export function controllerChangeDecision(input: {
  hadController: boolean;
  applying: boolean;
}): 'ignore' | 'reload' | 'mark' {
  if (!input.hadController) return 'ignore';
  return input.applying ? 'reload' : 'mark';
}

/** 프로필 「앱 버전」 줄 — 버튼을 그릴지·누를 수 있는지. 셸이 진행 중 운동을 읽기 전은 「모름」(checking). */
export function updateRowState(input: {
  available: boolean;
  activeLoaded: boolean;
  activeWorkoutId: string | null | undefined;
}): 'none' | 'checking' | 'blocked' | 'ready' {
  if (!input.available) return 'none';
  if (!input.activeLoaded) return 'checking';
  if (input.activeWorkoutId) return 'blocked';
  return 'ready';
}

/**
 * 필수 업데이트(서버 최소 버전) — 지금 덮개를 띄울지.
 *   none  — 필수 아님 · 이미 진행/실패 화면 · 이 문서에서 사람이 실패를 닫음
 *   wait  — 운동 중 · 운동 화면(요약·완료 시트 포함 · #64) · 셸 판단 전 → 끝나면 다시 판단
 *   start — 같은 덮개로 업데이트
 * 서버가 최소 버전 이상을 **실제로 갖고 있을 때만** 필수(QA H-1 — 오설정이면 업데이트해도 미만이라 루프가 된다).
 */
export function mandatoryUpdateAction(input: {
  currentVersion: string;
  minVersion: string | null | undefined;
  serverVersion: string | null | undefined;
  phase: 'idle' | 'updating' | 'failed';
  dismissed: boolean;
  activeLoaded: boolean;
  activeWorkoutId: string | null | undefined;
  pathname: string | null | undefined;
}): 'none' | 'wait' | 'start' {
  if (!isBelowMinVersion(input.currentVersion, input.minVersion)) return 'none';
  const serverHas = compareVersions(input.serverVersion, input.minVersion);
  if (serverHas === null || serverHas < 0) return 'none';
  if (input.phase !== 'idle' || input.dismissed) return 'none';
  if (!input.activeLoaded || input.activeWorkoutId || isUpdateHoldPath(input.pathname)) return 'wait';
  return 'start';
}

export type BootMarker = { at: number; fromBuild: string | null; fromVersion?: string | null };

/** 새로고침 직후 표식 읽기 — 없음·깨짐·오래됨은 null. */
export function readBootMarker(raw: string | null | undefined, now: number): BootMarker | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<BootMarker>;
    if (typeof o.at !== 'number' || now - o.at > BOOT_MARKER_TTL_MS || now < o.at - BOOT_MARKER_TTL_MS) return null;
    return { at: o.at, fromBuild: o.fromBuild ?? null, ...(o.fromVersion !== undefined ? { fromVersion: o.fromVersion } : {}) };
  } catch {
    return null;
  }
}
