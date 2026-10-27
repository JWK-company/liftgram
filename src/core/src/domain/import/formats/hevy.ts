// @plm SRS-081  Hevy 내보내기 CSV.
//   title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,
//   distance_km,duration_seconds,rpe
// 단위 변형: weight_kg | weight_lbs · distance_km | distance_miles. 날짜: ISO 와 「25 Aug 2026, 10:10」 둘 다.
// set_type: normal · warmup · dropset · failure(빈 칸 = normal).
import type { CsvRow } from '../csv';
import {
  emptyResult,
  headerKey,
  localDiffSec,
  normalizeLocalTime,
  readNumber,
  textOrNull,
  type ParsedExercise,
  type ParsedSetKind,
  type ParsedWorkout,
  type ParseIssue,
  type ParseResult,
} from '../common';

export function isHevyHeader(header: string[]): boolean {
  const keys = new Set(header.map(headerKey));
  return keys.has('exercise_title') && keys.has('start_time');
}

function setKindOf(raw: string | undefined): ParsedSetKind | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s || s === 'normal') return 'normal';
  if (s === 'warmup' || s === 'warm_up' || s === 'warm-up') return 'warmup';
  if (s === 'dropset' || s === 'drop_set' || s === 'drop') return 'drop';
  if (s === 'failure') return 'failure';
  return null;
}

export function parseHevy(rows: CsvRow[]): ParseResult {
  if (rows.length === 0) return emptyResult('empty');
  const header = rows[0].cells.map(headerKey);
  const col = (name: string) => header.indexOf(name);
  const iTitle = col('title');
  const iStart = col('start_time');
  const iEnd = col('end_time');
  const iDesc = col('description');
  const iEx = col('exercise_title');
  const iSs = col('superset_id');
  const iExNote = col('exercise_notes');
  const iType = col('set_type');
  const iKg = col('weight_kg');
  const iLb = col('weight_lbs');
  const iReps = col('reps');
  const iKm = col('distance_km');
  const iMi = col('distance_miles');
  const iDur = col('duration_seconds');
  const iRpe = col('rpe');
  const iWeight = iKg >= 0 ? iKg : iLb;
  const iDist = iKm >= 0 ? iKm : iMi;

  const required: [string, number][] = [
    ['start_time', iStart],
    ['exercise_title', iEx],
    ['weight_kg|weight_lbs', iWeight],
    ['reps', iReps],
  ];
  const missing = required.filter(([, i]) => i < 0).map(([n]) => n);
  if (missing.length) return emptyResult('missing_columns', { source: 'hevy', format: 'hevy', missingColumns: missing });

  const issues: ParseIssue[] = [];
  const workouts: ParsedWorkout[] = [];
  let setCount = 0;
  let cur: ParsedWorkout | null = null;
  let curKey: string | null = null;
  let curEx: ParsedExercise | null = null;
  const need = Math.max(iStart, iEx, iWeight, iReps);

  for (let r = 1; r < rows.length; r++) {
    const { line, cells } = rows[r];
    if (cells.length <= need) {
      issues.push({ line, reason: 'column_count' });
      continue;
    }
    const start = normalizeLocalTime(cells[iStart] ?? '');
    if (!start) {
      issues.push({ line, reason: 'bad_date', column: 'start_time' });
      continue;
    }
    const endRaw = iEnd >= 0 ? (cells[iEnd] ?? '').trim() : '';
    const end = endRaw ? normalizeLocalTime(endRaw) : null;
    if (endRaw && !end) {
      issues.push({ line, reason: 'bad_date', column: 'end_time' });
      continue;
    }
    const exName = textOrNull(cells[iEx]);
    if (!exName) {
      issues.push({ line, reason: 'missing_exercise_name', column: 'exercise_title' });
      continue;
    }
    const kind = setKindOf(iType >= 0 ? cells[iType] : undefined);
    if (!kind) {
      issues.push({ line, reason: 'bad_set_order', column: 'set_type' });
      continue;
    }
    const nums: [string, number][] = [
      [header[iWeight], iWeight],
      ['reps', iReps],
      [iDist >= 0 ? header[iDist] : 'distance', iDist],
      ['duration_seconds', iDur],
      ['rpe', iRpe],
    ];
    const vals: (number | null)[] = [];
    let bad: string | null = null;
    for (const [n, i] of nums) {
      const v = i >= 0 ? readNumber(cells[i]) : null;
      if (v !== null && Number.isNaN(v)) {
        bad = n;
        break;
      }
      vals.push(v);
    }
    if (bad) {
      issues.push({ line, reason: 'bad_number', column: bad });
      continue;
    }
    const [weight, reps, distance, durationSec, rpe] = vals;

    const title = iTitle >= 0 ? textOrNull(cells[iTitle]) : null;
    const key = `${start.local}\u0000${end?.local ?? ''}\u0000${title ?? ''}`;
    if (!cur || key !== curKey) {
      // 시간대가 붙은 ISO 면 두 시각을 같은 오프셋으로 본다 — 운동 하나가 서머타임 경계를 넘는 경우는 무시한다.
      const dur = end ? localDiffSec(start.local, end.local) + ((start.offsetMin ?? 0) - (end.offsetMin ?? start.offsetMin ?? 0)) * 60 : null;
      cur = {
        localStart: start.local,
        explicitOffsetMin: start.offsetMin,
        durationSec: dur != null && dur > 0 ? dur : null,
        title,
        note: iDesc >= 0 ? textOrNull(cells[iDesc]) : null,
        exercises: [],
        line,
      };
      workouts.push(cur);
      curKey = key;
      curEx = null;
    }
    const ss = iSs >= 0 ? textOrNull(cells[iSs]) : null;
    if (!curEx || curEx.name !== exName || curEx.supersetKey !== ss) {
      curEx = { name: exName, note: iExNote >= 0 ? textOrNull(cells[iExNote]) : null, supersetKey: ss, sets: [] };
      cur.exercises.push(curEx);
    }
    curEx.sets.push({ line, kind, weight, reps, rpe, distance, durationSec, note: null });
    setCount++;
  }

  return {
    source: 'hevy',
    format: 'hevy',
    fileWeightUnit: iKg >= 0 ? 'kg' : 'lb',
    fileDistanceUnit: iDist < 0 ? null : iKm >= 0 ? 'km' : 'mile',
    workouts,
    issues,
    rowCount: rows.length - 1,
    setCount,
    fatal: null,
  };
}
