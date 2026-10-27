// @plm SRS-081  Strong 내보내기 CSV — 두 변형을 읽는다.
//   쉼표:     Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
//             → 무게·거리 단위가 파일에 없다(사용자가 kg/lb 를 고른다) · Duration 은 「1h 5m」 꼴
//   세미콜론: "Workout #";"Date";"Workout Name";"Duration (sec)";"Exercise Name";"Set Order";"Weight (kg)";"Reps";"RPE";
//             "Distance (meters)";"Seconds";"Notes";"Workout Notes"
// Set Order: 숫자 = 일반 · W = 워밍업 · D = 드롭 · F = 실패. 「Rest Timer」 행은 세트가 아니라 건너뛴다(오류 아님).
import type { CsvRow } from '../csv';
import {
  emptyResult,
  headerKey,
  normalizeLocalTime,
  readNumber,
  textOrNull,
  type ImportWeightUnit,
  type ParsedExercise,
  type ParsedSetKind,
  type ParsedWorkout,
  type ParseIssue,
  type ParseResult,
} from '../common';

/** 헤더가 Strong 형식인가 */
export function isStrongHeader(header: string[]): boolean {
  const keys = new Set(header.map(headerKey));
  return keys.has('exercise name') && keys.has('set order') && keys.has('date');
}

/** 「1h 5m」·「45m」·「30s」·「01:05:00」 → 초. 읽을 수 없으면 null */
export function parseStrongDuration(raw: string | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const hms = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hms) return hms[3] != null ? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) : Number(hms[1]) * 3600 + Number(hms[2]) * 60;
  const parts = s.match(/\d+(?:\.\d+)?\s*[hms]/g);
  if (!parts || parts.join('').replace(/\s/g, '') !== s.replace(/\s/g, '')) return null;
  let sec = 0;
  for (const p of parts) {
    const n = Number.parseFloat(p);
    const unit = p.trim().slice(-1);
    sec += unit === 'h' ? n * 3600 : unit === 'm' ? n * 60 : n;
  }
  return Math.round(sec);
}

function setKindOf(raw: string): ParsedSetKind | 'rest' | null {
  const s = raw.trim().toUpperCase();
  if (/^\d+$/.test(s)) return 'normal';
  if (s === 'W') return 'warmup';
  if (s === 'D') return 'drop';
  if (s === 'F') return 'failure';
  if (s.includes('REST')) return 'rest';
  return null;
}

/** Strong 파일 → 파싱 결과. 첫 행은 헤더다. */
export function parseStrong(rows: CsvRow[], delimiter: ',' | ';'): ParseResult {
  if (rows.length === 0) return emptyResult('empty');
  const header = rows[0].cells.map(headerKey);
  const col = (name: string) => header.indexOf(name);
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));

  const iDate = col('date');
  const iName = col('workout name');
  const iWorkoutNo = col('workout #');
  const iDur = find(/^duration( \(sec\))?$/);
  const durInSec = header[iDur] === 'duration (sec)';
  const iEx = col('exercise name');
  const iOrder = col('set order');
  const iWeight = find(/^weight( \((kg|kgs|lb|lbs)\))?$/);
  const iReps = col('reps');
  const iDist = find(/^distance( \((meters|m|km|miles|mi)\))?$/);
  const iSec = col('seconds');
  const iNotes = col('notes');
  const iWNotes = col('workout notes');
  const iRpe = col('rpe');

  const required: [string, number][] = [
    ['Date', iDate],
    ['Exercise Name', iEx],
    ['Set Order', iOrder],
    ['Weight', iWeight],
    ['Reps', iReps],
  ];
  const missing = required.filter(([, i]) => i < 0).map(([n]) => n);
  const format = delimiter === ';' ? 'strong-semicolon' : 'strong-comma';
  if (missing.length) return emptyResult('missing_columns', { source: 'strong', format, missingColumns: missing });

  const wUnitHead = /\((kg|kgs|lb|lbs)\)/.exec(header[iWeight])?.[1];
  const fileWeightUnit: ImportWeightUnit | null = wUnitHead ? (wUnitHead.startsWith('kg') ? 'kg' : 'lb') : null;
  const dUnitHead = iDist >= 0 ? /\((meters|m|km|miles|mi)\)/.exec(header[iDist])?.[1] : undefined;
  const fileDistanceUnit = dUnitHead ? (dUnitHead === 'km' ? 'km' : dUnitHead.startsWith('mi') ? 'mile' : 'm') : null;

  const issues: ParseIssue[] = [];
  const workouts: ParsedWorkout[] = [];
  let setCount = 0;
  let cur: ParsedWorkout | null = null;
  let curKey: string | null = null;
  let curEx: ParsedExercise | null = null;

  for (let r = 1; r < rows.length; r++) {
    const { line, cells } = rows[r];
    if (cells.length < header.length) {
      // 끝 칸(메모·RPE)이 빠진 행은 비어 있는 것으로 본다 — 필수 칸까지 없을 때만 깨진 행.
      const need = Math.max(iDate, iEx, iOrder, iWeight, iReps);
      if (cells.length <= need) {
        issues.push({ line, reason: 'column_count' });
        continue;
      }
    }
    const t = normalizeLocalTime(cells[iDate] ?? '');
    if (!t) {
      issues.push({ line, reason: 'bad_date', column: 'Date' });
      continue;
    }
    const exName = textOrNull(cells[iEx]);
    if (!exName) {
      issues.push({ line, reason: 'missing_exercise_name', column: 'Exercise Name' });
      continue;
    }
    const kind = setKindOf(cells[iOrder] ?? '');
    if (kind === null) {
      issues.push({ line, reason: 'bad_set_order', column: 'Set Order' });
      continue;
    }
    const nums: [string, number][] = [
      ['Weight', iWeight],
      ['Reps', iReps],
      ['Distance', iDist],
      ['Seconds', iSec],
      ['RPE', iRpe],
    ];
    const vals: Record<string, number | null> = {};
    let bad: string | null = null;
    for (const [n, i] of nums) {
      const v = i >= 0 ? readNumber(cells[i]) : null;
      if (v !== null && Number.isNaN(v)) {
        bad = n;
        break;
      }
      vals[n] = v;
    }
    if (bad) {
      issues.push({ line, reason: 'bad_number', column: bad });
      continue;
    }

    const title = iName >= 0 ? textOrNull(cells[iName]) : null;
    const key = iWorkoutNo >= 0 && textOrNull(cells[iWorkoutNo]) ? `#${cells[iWorkoutNo].trim()}` : `${t.local}\u0000${title ?? ''}`;
    if (!cur || key !== curKey) {
      const durRaw = iDur >= 0 ? cells[iDur] : undefined;
      const dur = durInSec ? readNumber(durRaw) : parseStrongDuration(durRaw);
      cur = {
        localStart: t.local,
        explicitOffsetMin: t.offsetMin,
        durationSec: dur != null && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
        title,
        note: iWNotes >= 0 ? textOrNull(cells[iWNotes]) : null,
        exercises: [],
        line,
      };
      workouts.push(cur);
      curKey = key;
      curEx = null;
    }
    if (kind === 'rest') continue;
    if (!curEx || curEx.name !== exName) {
      curEx = { name: exName, note: null, supersetKey: null, sets: [] };
      cur.exercises.push(curEx);
    }
    curEx.sets.push({
      line,
      kind,
      weight: vals.Weight,
      reps: vals.Reps,
      rpe: vals.RPE,
      distance: vals.Distance,
      durationSec: vals.Seconds,
      note: iNotes >= 0 ? textOrNull(cells[iNotes]) : null,
    });
    setCount++;
  }

  // 휴식 타이머 행만 있던 운동 블록·운동은 버린다.
  const kept = workouts.filter((w) => w.exercises.some((e) => e.sets.length > 0));
  return {
    source: 'strong',
    format,
    fileWeightUnit,
    fileDistanceUnit,
    workouts: kept,
    issues,
    rowCount: rows.length - 1,
    setCount,
    fatal: null,
  };
}
