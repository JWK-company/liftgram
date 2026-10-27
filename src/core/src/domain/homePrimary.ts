// @plm SRS-072  운동 홈의 주 행동 하나 고르기 — 화면 정리 M-2 확정 A (순수 함수)
//
// 빨강 채움(주 행동)은 화면에 하나다. 무엇을 빨강으로 할지가 이 함수의 일이다.
//
//   운동 중              → 'active'  : 홈에는 주 행동이 없다(셸 하단 막대 「열기」가 주 행동)
//   루틴 0개             → 'quick'   : 빠른 운동 시작
//   오늘 이미 운동함      → 'quick'   : 오늘 할 루틴은 끝났다 — 더 한다면 빈 운동이 자연스럽다
//   스케줄상 오늘 휴식    → 'quick'   : 쉬는 날에 루틴을 빨강으로 권하지 않는다
//   그 밖                → 'routine' : 오늘 할 루틴(스케줄 배정 → 추천 → 최근 수행 → 첫 루틴)
//
// 루틴 후보는 **지금 있는 루틴**이어야 한다(지운 루틴은 시작할 수 없다) — 없는 id 는 건너뛰고 다음 순위로.

export type HomePrimarySource = 'schedule' | 'reco' | 'recent' | 'first';

export type HomePrimary =
  | { kind: 'active' }
  | { kind: 'quick'; reason: 'noRoutines' | 'workedOutToday' | 'restDay' }
  | { kind: 'routine'; routineId: string; source: HomePrimarySource };

export interface HomePrimaryInput {
  /** 진행 중인 운동이 있는가. */
  active: boolean;
  /** 지금 있는 루틴 id — 화면 목록 순서(첫 루틴 폴백이 이 순서를 따른다). */
  routineIds: readonly string[];
  /** 주간 스케줄의 오늘(스케줄이 없으면 'none'). */
  plan: { kind: 'routine'; routineId: string } | { kind: 'rest' } | { kind: 'none' };
  /** 오늘 완료한 운동이 있는가. */
  workedOutToday: boolean;
  /** 추천 루틴 id(추천이 성립하지 않으면 null). */
  recoRoutineId: string | null;
  /** 가장 최근에 마친 루틴 운동의 루틴 id(없으면 null). */
  recentRoutineId: string | null;
}

export function pickHomePrimary(input: HomePrimaryInput): HomePrimary {
  if (input.active) return { kind: 'active' };
  if (input.routineIds.length === 0) return { kind: 'quick', reason: 'noRoutines' };
  if (input.workedOutToday) return { kind: 'quick', reason: 'workedOutToday' };
  if (input.plan.kind === 'rest') return { kind: 'quick', reason: 'restDay' };

  const exists = (id: string | null | undefined): id is string => !!id && input.routineIds.includes(id);
  if (input.plan.kind === 'routine' && exists(input.plan.routineId)) {
    return { kind: 'routine', routineId: input.plan.routineId, source: 'schedule' };
  }
  if (exists(input.recoRoutineId)) return { kind: 'routine', routineId: input.recoRoutineId, source: 'reco' };
  if (exists(input.recentRoutineId)) {
    return { kind: 'routine', routineId: input.recentRoutineId, source: 'recent' };
  }
  return { kind: 'routine', routineId: input.routineIds[0] as string, source: 'first' };
}
