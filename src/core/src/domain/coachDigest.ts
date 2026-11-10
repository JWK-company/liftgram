// 담당 회원 점검(SPEC-050 P4) — 서버 ListMemberDigest 의 사실 숫자를 기기 날짜로 읽는다.
//
//   · 「이번 주」 = 보는 기기의 월요일 0시부터(서버는 시간대를 모른다 → 화면이 week_start 를 보낸다)
//   · 「N일째 쉬는 중」 = 마지막 운동한 날과 오늘의 달력 날짜 차이(기기 시간대). 3일 이상이면 목록 위로 올린다.
//   · 판단 문구는 없다(ADR-028) — 숫자와 날만 보인다.

export const REST_ALERT_DAYS = 3;

const DAY = 86_400_000;

/** 기기 시간대의 이번 주 월요일 0시(epoch ms). */
export function weekStartMs(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** 마지막 운동한 날부터 오늘까지 쉰 날 수(오늘 했으면 0). 운동이 없으면 null. */
export function restDays(lastWorkoutAt: number, now: number = Date.now()): number | null {
  if (!Number.isFinite(lastWorkoutAt) || lastWorkoutAt <= 0) return null;
  const a = new Date(lastWorkoutAt);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  // 서머타임이 있는 시간대에서도 하루 = 23~25시간 — 반올림으로 날짜 차이를 센다
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY));
}

export interface DigestLike {
  memberId: string;
  logView: boolean;
  lastWorkoutAt: number;
}

/**
 * 담당 회원 줄 순서 — 3일 이상 쉰 회원이 위로(오래 쉰 순), 나머지는 원래 순서 그대로(안정 정렬).
 * 점검이 없는 회원(아직 못 읽음·기록 보기 꺼짐)은 원래 자리.
 */
export function orderByRest<T>(
  items: readonly T[],
  idOf: (x: T) => string,
  digest: ReadonlyMap<string, DigestLike>,
  now: number = Date.now(),
): T[] {
  const rest = (x: T): number => {
    const d = digest.get(idOf(x));
    if (!d || !d.logView) return -1;
    const r = restDays(d.lastWorkoutAt, now);
    return r !== null && r >= REST_ALERT_DAYS ? r : -1;
  };
  return items
    .map((x, i) => ({ x, i, r: rest(x) }))
    .sort((a, b) => {
      const ua = a.r >= 0 ? 1 : 0;
      const ub = b.r >= 0 ? 1 : 0;
      if (ua !== ub) return ub - ua;
      if (ua && a.r !== b.r) return b.r - a.r;
      return a.i - b.i;
    })
    .map((e) => e.x);
}
