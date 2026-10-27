// @plm SRS-079 SRS-080  기간 성과 요약 — 회원 기기 원본(_raw)을 읽어 core 계산(summaryInputFromRaw → buildPeriodSummary)에 넘긴다.
//
// 읽기만 한다(쓰지 않는다). 계산 경로는 트레이너 리포트(memberReportFromRecords)와 **같은 변환 함수**를 지난다(ADR-040).
//
// 읽는 범위:
//   · 새 기록 목록(prs)을 만들 때(prList) — 기간 끝 전의 **완료 운동 전부**(PR 기준선이 기간 앞 이력까지 필요하다 · S-3).
//   · 목록을 만들지 않을 때 — [직전 기간 시작, 기간 끝) 만(트레이너 쪽 서버 응답과 같은 범위).
//   · 목록은 기간이 PR_LIST_MAX_DAYS(100일 — 「3개월」까지) 이하일 때만 만든다. 그보다 긴 「직접」 기간은 개수(prCount)만.
//     목록 50개 상한(SUMMARY_MAX_PRS)이 긴 기간에서는 가장 최근 것만 남겨 오히려 기간 전체를 말하지 못한다.
//   · 체중 섹션 재료는 기간 안 측정만(보내기 기본 꺼짐 — 화면이 끈다 · S-11).
// 측정(1년 표본 · e2e opengym-summary)은 보고서 p4-ui-report.md 에 적었다.
import { Q } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
import { database } from '../db/database';
import {
  buildPeriodSummary,
  previousRange,
  summaryRangeDays,
  type SummaryRange,
  type SummaryV1,
} from '../domain/periodSummary';
import type { SummaryExerciseRec } from '../domain/periodSummary';
import { exerciseFromRaw, summaryInputFromRaw } from '../domain/summaryRecords';
import type { AppLanguage } from '../domain/types';
import { listBodyweightLogs, toBodyweightLogLike } from './bodyweightRepository';
import { getUserBodyweightKg } from './workoutRepository';

/** 새 기록 목록을 만드는 최장 기간(일) — 「3개월」(최대 92일)을 덮는다 */
export const PR_LIST_MAX_DAYS = 100;

type Raw = Record<string, unknown>;
const raw = (m: Model): Raw => m._raw as unknown as Raw;

/** Q.oneOf 가 너무 긴 목록을 한 번에 받지 않게 나눠 읽는다 */
async function fetchByIds(table: string, column: string, ids: readonly string[]): Promise<Raw[]> {
  const out: Raw[] = [];
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const rows = await database.get(table).query(Q.where(column, Q.oneOf(part))).fetch();
    for (const r of rows) out.push(raw(r));
  }
  return out;
}

export interface MemberSummaryResult {
  /** 계산 결과(아직 섹션을 끄지 않은 전체 — 화면이 omitSections 로 끈다) */
  summary: SummaryV1;
  /** 측정 — 읽기·계산 시간(ms)과 읽은 행 수 */
  stats: { readMs: number; computeMs: number; workouts: number; sets: number; prList: boolean };
}

export interface MemberSummaryOptions {
  lang?: AppLanguage;
  /** 강제로 목록을 켜고 끈다(기본 = 기간 ≤ PR_LIST_MAX_DAYS) */
  prList?: boolean;
}

/** 회원 본인 기기 기록으로 기간 성과 요약을 만든다. */
export async function buildMemberSummary(range: SummaryRange, opts: MemberSummaryOptions = {}): Promise<MemberSummaryResult> {
  const t0 = Date.now();
  const prList = opts.prList ?? summaryRangeDays(range) <= PR_LIST_MAX_DAYS;
  const clauses = [Q.where('state', 'completed'), Q.where('started_at', Q.lt(range.endMs))];
  if (!prList) clauses.push(Q.where('started_at', Q.gte(previousRange(range).startMs)));
  const workouts = (await database.get('workouts').query(...clauses).fetch()).map(raw);
  const workoutExercises = await fetchByIds('workout_exercises', 'workout_id', workouts.map((w) => String(w.id)));
  const setLogs = await fetchByIds('set_logs', 'workout_exercise_id', workoutExercises.map((b) => String(b.id)));
  const exIds = [...new Set(workoutExercises.map((b) => String(b.exercise_id)))];
  const exercises = await fetchByIds('exercises', 'id', exIds);

  // 표시 이름(ADR-033) — 운동 화면·분석과 같은 이름
  const { getExerciseDisplayNameMap } = await import('./exerciseNames');
  const names = await getExerciseDisplayNameMap(exIds);
  // 체중 — 완료 판정과 같은 값(맨몸·보조 유효무게) · 이력은 기간 안 측정만
  const bodyweightKg = await getUserBodyweightKg();
  const logs = (await listBodyweightLogs({ startMs: range.startMs, endMs: range.endMs })).map(toBodyweightLogLike);
  const t1 = Date.now();

  const input = summaryInputFromRaw(
    { workouts, workoutExercises, setLogs, exercises },
    { range, bodyweightKg, bodyweightLogs: logs, prList, lang: opts.lang, displayName: (id) => names.get(id) },
  );
  const summary = buildPeriodSummary(input);
  const t2 = Date.now();
  return {
    summary,
    stats: { readMs: t1 - t0, computeMs: t2 - t1, workouts: workouts.length, sets: setLogs.length, prList },
  };
}

/** 트레이너 리포트용 기기 카탈로그(시드 종목 근육·하중모드) — memberReportFromRecords 의 catalog 인자. 읽기만. */
export async function loadSummaryCatalog(): Promise<SummaryExerciseRec[]> {
  const rows = await database.get('exercises').query().fetch();
  const out: SummaryExerciseRec[] = [];
  for (const r of rows) {
    const e = exerciseFromRaw(raw(r));
    if (e) out.push(e);
  }
  return out;
}
