// 옛 기록 「확인 필요」 백필(SPEC-044 · REV-079 D-1) — v28 이전 기록·옛 기기 기록을 기기마다 한 번 판정한다.
// 로그인 기기는 **이번 실행의 첫 동기가 성공한 뒤**(일부만 받은 채 표식을 찍지 않게 · 화면 리뷰 4), 로그인 안 한 기기는 부팅 20초 뒤.
// 운동 중이 아니고 이 탭이 쓰기 주인일 때만 · 완료 운동이 없으면 표식을 찍지 않는다(빈 DB 에서 끝내지 않게 · 데이터 리뷰 7).
const FLAG = "lg.suspectBackfill.v28";
const LOCAL_DELAY_MS = 20_000;
const AFTER_SYNC_MS = 3_000;

function done(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return true; // 저장소를 못 쓰면 매번 돌지 않게
  }
}

async function run(): Promise<void> {
  const repo = await import("@app/core/data/workoutRepository");
  if (await repo.getActiveWorkout()) return; // 운동 중이면 다음 실행에
  const { getWriterState } = await import("./tabGuard");
  if (getWriterState() !== "owner") return; // 쓰기 주인 탭만(화면 리뷰 4)
  const hasHistory = (await repo.countCompletedWorkouts()) > 0;
  await repo.backfillSuspectsV28();
  const { flushLocalDb } = await import("./localDb");
  await flushLocalDb();
  if (!hasHistory) return;
  try {
    localStorage.setItem(FLAG, "1");
  } catch {
    // 표식을 못 남기면 다음 실행에 다시(같은 값이면 쓰지 않는다)
  }
}

export function scheduleSuspectBackfill(): () => void {
  if (typeof window === "undefined" || done()) return () => {};
  let cancelled = false;
  let timer = 0;
  let unsub: (() => void) | null = null;
  const fire = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (cancelled) return;
      unsub?.();
      unsub = null;
      void run().catch((e) => console.warn("[suspect] 백필 실패", e));
    }, ms);
  };
  // 첫 동기의 시작 시각이 이 함수보다 조금 앞설 수 있다(동기는 부팅 직후 시작) — 10초 여유
  const bootAt = Date.now() - 10_000;
  void (async () => {
    const { hasSession } = await import("./session");
    if (cancelled) return;
    if (!hasSession()) {
      fire(LOCAL_DELAY_MS);
      return;
    }
    const { subscribeSyncHealth } = await import("@app/core/sync/syncEngine");
    if (cancelled) return;
    unsub = subscribeSyncHealth((h) => {
      if (h.lastSuccessAt != null && h.lastSuccessAt >= bootAt && !timer) fire(AFTER_SYNC_MS);
    });
  })();
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    unsub?.();
  };
}
