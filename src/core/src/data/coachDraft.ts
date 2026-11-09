// 코치 기기의 루틴 초안(SPEC-050 P3b) — 회원에게 보낼 루틴을 코치가 이 기기에서 짠다.
//
//   초안 = 내 routines 행 하나: is_archived=true(내 루틴 목록·오늘 카드·통계에 안 보인다) · coach_for=회원 id · 출처 없음.
//   편집은 기존 RoutineEditor 를 그대로 쓴다(초안 모드). 보내기는 이 행과 줄을 SendRoutine 요청 모양으로 바꿔 서버에 넘긴다 —
//   서버가 회원 sync 레코드에 쓴다(회원 루틴 id = coach-<crid>). 초안은 내 동기로 내 다른 기기에도 간다.
//   변형(기구·그립…) 칸은 보내지 않는다 — 회원 것이다(REV-102 L-1).
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Routine, RoutineExercise } from '../db/models';

const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');

/** 이 루틴이 코치 초안인가(보낼 회원이 정해져 있다). */
export function isCoachDraft(r: { coachFor?: string | null } | null | undefined): boolean {
  return !!r && typeof r.coachFor === 'string' && r.coachFor !== '';
}

/** 새 초안 — 화면에 들어오는 순간 만든다(보낼 회원을 붙여 둬야 편집기가 초안 모드로 연다). */
export async function createCoachDraft(memberId: string, name: string): Promise<Routine> {
  return database.write(async () =>
    routines().create((r) => {
      r.name = name.trim() || '새 루틴';
      r.folder = null;
      r.notes = null;
      r.sortOrder = 0;
      r.isArchived = true; // 내 목록·통계에 안 보이게
      r.userId = null;
      r.origin = null;
      r.coachId = null;
      r.coachName = null;
      r.coachFor = memberId;
    }),
  );
}

/** 이 회원에게 보낼 초안들(최근에 고친 것이 위). */
export function queryCoachDrafts(memberId: string): Query<Routine> {
  return routines().query(Q.where('coach_for', memberId), Q.sortBy('updated_at', Q.desc));
}

/**
 * 초안을 마지막으로 고친 때 — 루틴·줄 중 가장 늦은 updated_at(ms).
 * 「보내지 않은 변경 있음」은 보낸 내용의 지문(coachDraftHash)으로 가린다 — 이 값은 지문이 없을 때(다른 기기에서 보냄)만 쓴다.
 */
export async function coachDraftEditedAt(routineId: string): Promise<number> {
  const r = await routines().find(routineId);
  const lines = await routineExercises().query(Q.where('routine_id', routineId)).fetch();
  let at = r.updatedAt?.getTime?.() ?? 0;
  for (const l of lines) at = Math.max(at, l.updatedAt?.getTime?.() ?? 0);
  return at;
}

/** 초안을 「고쳤다」로 표시 — 줄을 지우면 남은 행으로는 알 수 없어서 루틴 행의 updated_at 을 움직인다. */
export async function touchCoachDraft(routineId: string): Promise<void> {
  await database.write(async () => {
    const r = await routines().find(routineId);
    if (!isCoachDraft(r)) return;
    await r.update(() => {});
  });
}

/** SendRoutine 요청의 한 줄 — 계약(SentRoutineLine)과 같은 이름. 0 은 「없음」. */
export interface CoachDraftLine {
  id: string;
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetWeightKg: number;
  restSeconds: number;
  supersetGroup: string;
  note: string;
  sortOrder: number;
  cardioTargetJson: string;
  prescriptionJson: string;
}

export interface CoachDraftSend {
  sourceRoutineId: string;
  name: string;
  notes: string;
  lines: CoachDraftLine[];
}

/** 초안 → 보낼 내용. 줄은 순서대로 0..n 으로 다시 매긴다(저장된 순서에 구멍이 있어도). */
export async function coachDraftSendInput(routineId: string): Promise<CoachDraftSend> {
  const r = await routines().find(routineId);
  const lines = await routineExercises()
    .query(Q.where('routine_id', routineId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  return {
    sourceRoutineId: r.id,
    name: r.name ?? '',
    notes: r.notes ?? '',
    lines: lines.map((l, i) => ({
      id: l.id,
      exerciseId: l.exerciseId,
      targetSets: l.targetSets ?? 0,
      targetRepsMin: l.targetRepsMin ?? 0,
      targetRepsMax: l.targetRepsMax ?? 0,
      targetWeightKg: l.targetWeightKg ?? 0,
      restSeconds: l.restSeconds ?? 0,
      supersetGroup: l.supersetGroup ?? '',
      note: l.note ?? '',
      sortOrder: i,
      cardioTargetJson: l.cardioTarget ? JSON.stringify(l.cardioTarget) : '',
      prescriptionJson: l.prescription && l.prescription.length > 0 ? JSON.stringify(l.prescription) : '',
    })),
  };
}

/**
 * 보낼 내용의 지문 — 보낸 때의 지문과 지금 지문이 다르면 「보내지 않은 변경 있음」(리뷰 H-1).
 * 시계(updated_at)를 보지 않는다: 보기만 하고 나가도·이름을 같은 값으로 다시 써도 「변경」이 되지 않는다.
 * 키 순서가 고정된 객체(coachDraftSendInput)를 직렬화해 53비트 문자열 해시(cyrb53)로 줄인다.
 */
export function coachDraftHash(input: CoachDraftSend): string {
  const str = JSON.stringify([input.name.trim(), input.notes.trim(), input.lines]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * 이 초안에 직접 만든 종목이 있나 — 있으면 그 종목(보내기 전에 알린다 · 서버도 거절한다).
 * 이름은 화면이 표시 언어로 고른다(id 로 표시 이름을 찾는다 · nameKo 는 못 찾을 때의 대신).
 */
export async function coachDraftCustomExercise(routineId: string): Promise<{ id: string; nameKo: string } | null> {
  const lines = await routineExercises().query(Q.where('routine_id', routineId)).fetch();
  if (lines.length === 0) return null;
  const ids = [...new Set(lines.map((l) => l.exerciseId))];
  const exs = await database.get('exercises').query(Q.where('id', Q.oneOf(ids))).fetch();
  for (const e of exs) {
    const x = e as unknown as { id: string; isCustom: boolean; nameKo: string };
    if (x.isCustom) return { id: x.id, nameKo: x.nameKo };
  }
  return null;
}
