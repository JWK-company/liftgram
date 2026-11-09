// 루틴 출처(SPEC-050 P3a · 로컬 스키마 v30) — 누가 짠 루틴인지와, 회원이 무엇을 고칠 수 있는지.
//
//   null          내가 만든 것(옛 루틴 전부) — 다 고친다
//   'coach'       코치가 보낸 것 — 이름·메모·종목·세트는 잠그고 폴더·삭제만 회원 것(isCoachLockedOrigin)
//   'coach_ended' 코칭이 끝나 내 것이 된 코치 루틴 — 다 고친다 · 회색 「코칭 끝남」
//   'import'      피드·크리에이터·프로그램에서 가져온 것 — 다 고친다 · 회색 「가져옴」
//
// 칸 이름은 동기 레코드(jsonb) 그대로다. 공유·내보내기로 남에게 갈 때는 출처 칸을 뺀다(사칭 방지 · REV-097).

export type RoutineOrigin = 'coach' | 'coach_ended' | 'import';

/** 동기·백업 레코드에서 출처를 이루는 칸 — 공유·내보내기 때 뺀다. */
export const ROUTINE_ORIGIN_FIELDS = ['origin', 'coach_id', 'coach_name', 'coach_for'] as const;

const KNOWN = new Set<string>(['coach', 'coach_ended', 'import']);

/** 저장된 값 → 출처. 모르는 값(새 앱이 쓴 값 등)은 null — 잠그지 않는 쪽으로 읽는다. */
export function routineOriginOf(v: unknown): RoutineOrigin | null {
  return typeof v === 'string' && KNOWN.has(v) ? (v as RoutineOrigin) : null;
}

/** 코치가 보낸 루틴이라 회원이 처방(이름·메모·종목·세트)을 못 바꾸나. 끝난 코칭(coach_ended)은 풀린다. */
export function isCoachLockedOrigin(origin: unknown): boolean {
  return routineOriginOf(origin) === 'coach';
}

export type RoutineOriginBadge =
  | { kind: 'coach'; coachName: string | null }
  | { kind: 'coachEnded' }
  | { kind: 'import' }
  | null;

/** 목록·카드에 붙일 출처 표시 — 내가 만든 루틴은 null(아무것도 안 붙인다). */
export function routineOriginBadge(r: { origin?: unknown; coachName?: unknown }): RoutineOriginBadge {
  const o = routineOriginOf(r.origin);
  if (o === 'coach') {
    const name = typeof r.coachName === 'string' && r.coachName.trim() ? r.coachName.trim() : null;
    return { kind: 'coach', coachName: name };
  }
  if (o === 'coach_ended') return { kind: 'coachEnded' };
  if (o === 'import') return { kind: 'import' };
  return null;
}

/** 레코드에서 출처 칸을 뺀 사본 — 공유·내보내기 직렬화용(원본은 건드리지 않는다). */
export function stripRoutineOriginFields<T extends Record<string, unknown>>(raw: T): T {
  const out: Record<string, unknown> = { ...raw };
  for (const k of ROUTINE_ORIGIN_FIELDS) delete out[k];
  return out as T;
}
