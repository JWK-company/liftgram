// @plm SRS-081  CSV 읽기·Strong 2종·Hevy kg/lb·깨진 행·빈 파일 — 시험 파일 값은 전부 지어낸 것.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCsv, detectDelimiter } from '../import/csv';
import { importFileLabel, normalizeLocalTime } from '../import/common';
import { parseImportFile, distinctExerciseNames } from '../import/parse';
import { parseStrongDuration } from '../import/formats/strong';

const fx = (name: string) => readFileSync(new URL(`./fixtures/import/${name}`, import.meta.url), 'utf8');

test('csv — RFC 4180 · BOM · CRLF · 따옴표 안 줄바꿈·구분자', () => {
  const r = parseCsv('\uFEFFa,b,c\r\n"x, y","say ""hi""","l1\nl2"\r\n\r\n1,2,3');
  assert.equal(r.delimiter, ',');
  assert.deepEqual(r.rows.map((x) => x.cells), [['a', 'b', 'c'], ['x, y', 'say "hi"', 'l1\nl2'], ['1', '2', '3']]);
  assert.deepEqual(r.rows.map((x) => x.line), [1, 2, 5]);
  assert.equal(detectDelimiter('"a";"b";"c"\n1;2;3'), ';');
  assert.equal(detectDelimiter('"a;b",c,d'), ',');
  assert.equal(parseCsv('a,"b').unterminatedQuoteLine, 1);
  assert.deepEqual(parseCsv('a,b\r1,2\r').rows.map((x) => x.cells), [['a', 'b'], ['1', '2']]); // 옛 맥 CR
});

test('현지 시각 정규화 — 시간대 해석 전 문자열 · 초 보충', () => {
  assert.deepEqual(normalizeLocalTime('2026-08-25 10:10:00'), { local: '2026-08-25T10:10:00', offsetMin: null });
  assert.deepEqual(normalizeLocalTime('2026-08-25T10:10'), { local: '2026-08-25T10:10:00', offsetMin: null });
  assert.deepEqual(normalizeLocalTime('25 Aug 2026, 10:10'), { local: '2026-08-25T10:10:00', offsetMin: null });
  assert.deepEqual(normalizeLocalTime('5 Sep 2026, 7:05 PM'), { local: '2026-09-05T19:05:00', offsetMin: null });
  assert.deepEqual(normalizeLocalTime('2026-08-25T01:10:00.000Z'), { local: '2026-08-25T01:10:00', offsetMin: 0 });
  assert.deepEqual(normalizeLocalTime('2026-08-25T10:10:00+09:00'), { local: '2026-08-25T10:10:00', offsetMin: 540 });
  assert.equal(normalizeLocalTime('2026-02-30 10:00:00'), null);
  assert.equal(normalizeLocalTime('2026-13-40 10:10:00'), null);
  assert.equal(normalizeLocalTime('어제'), null);
});

test('Strong Duration', () => {
  assert.equal(parseStrongDuration('1h 5m'), 3900);
  assert.equal(parseStrongDuration('45m'), 2700);
  assert.equal(parseStrongDuration('1h'), 3600);
  assert.equal(parseStrongDuration('30s'), 30);
  assert.equal(parseStrongDuration('01:05:00'), 3900);
  assert.equal(parseStrongDuration(''), null);
  assert.equal(parseStrongDuration('길다'), null);
});

test('Strong 쉼표 — 단위 없음 · W/D/F · 휴식 타이머 행 건너뜀 · 따옴표 안 줄바꿈 메모', () => {
  const r = parseImportFile(fx('strong-comma.csv'));
  assert.equal(r.fatal, null);
  assert.equal(r.source, 'strong');
  assert.equal(r.format, 'strong-comma');
  assert.equal(r.fileWeightUnit, null);
  assert.equal(r.workouts.length, 2);
  assert.equal(r.setCount, 9);
  assert.deepEqual(r.issues, []);
  const [w1, w2] = r.workouts;
  assert.equal(w1.localStart, '2026-08-25T10:10:00');
  assert.equal(w1.durationSec, 3900);
  assert.equal(w1.title, 'Push Day');
  assert.equal(w1.note, '가슴 날, 컨디션 좋음');
  assert.deepEqual(w1.exercises.map((e) => [e.name, e.sets.map((s) => s.kind).join(',')]), [
    ['Bench Press (Barbell)', 'warmup,normal,normal,drop'],
    ['Triceps Pushdown (Cable - Rope)', 'normal,failure'],
  ]);
  assert.equal(w1.exercises[0].sets[1].rpe, 8);
  assert.equal(w2.durationSec, 2700);
  assert.equal(w2.exercises[0].sets[0].note, '무릎 괜찮음\n다음엔 105');
  assert.deepEqual(w2.exercises[1].sets[0], { line: 12, kind: 'normal', weight: 0, reps: 0, rpe: null, distance: 3.2, durationSec: 1200, note: null });
  assert.deepEqual(distinctExerciseNames(r), ['Bench Press (Barbell)', 'Triceps Pushdown (Cable - Rope)', 'Squat (Barbell)', 'Running']);
});

test('Strong 세미콜론 — BOM·CRLF · Weight (kg) · 소수 쉼표 · Workout # 로 같은 시각 두 운동 구분', () => {
  const r = parseImportFile(fx('strong-semicolon.csv'));
  assert.equal(r.fatal, null);
  assert.equal(r.format, 'strong-semicolon');
  assert.equal(r.fileWeightUnit, 'kg');
  assert.equal(r.fileDistanceUnit, 'm');
  assert.equal(r.workouts.length, 2);
  assert.equal(r.setCount, 4);
  assert.equal(r.workouts[0].durationSec, 3000);
  assert.equal(r.workouts[0].note, '새벽 운동; 졸림');
  assert.equal(r.workouts[0].exercises[0].sets[1].weight, 140.5);
  assert.equal(r.workouts[1].localStart, r.workouts[0].localStart);
  assert.equal(r.workouts[1].exercises[0].sets[0].distance, 2000);
});

test('Hevy kg — ISO · set_type · 슈퍼셋 · 시간 = end − start', () => {
  const r = parseImportFile(fx('hevy-kg.csv'));
  assert.equal(r.source, 'hevy');
  assert.equal(r.fileWeightUnit, 'kg');
  assert.equal(r.fileDistanceUnit, 'km');
  assert.equal(r.workouts.length, 2);
  assert.equal(r.setCount, 6);
  const [w1, w2] = r.workouts;
  assert.equal(w1.durationSec, 4500);
  assert.equal(w1.note, '주간 첫 운동');
  assert.deepEqual(w1.exercises.map((e) => [e.name, e.supersetKey, e.sets.map((s) => s.kind).join(',')]), [
    ['Bench Press (Barbell)', null, 'warmup,normal,failure'],
    ['Bicep Curl (Dumbbell)', '0', 'normal'],
    ['Triceps Pushdown (Cable)', '0', 'drop'],
  ]);
  assert.equal(w1.exercises[1].note, '천천히');
  assert.equal(w2.exercises[0].sets[0].distance, 5);
  assert.equal(w2.durationSec, 1800);
});

test('Hevy lb — weight_lbs · distance_miles · 「25 Aug 2026, 10:10」', () => {
  const r = parseImportFile(fx('hevy-lb.csv'));
  assert.equal(r.fileWeightUnit, 'lb');
  assert.equal(r.fileDistanceUnit, 'mile');
  assert.equal(r.workouts[0].localStart, '2026-08-25T10:10:00');
  assert.equal(r.workouts[0].durationSec, 4200);
  assert.equal(r.workouts[1].localStart, '2026-08-26T19:05:00');
  assert.equal(r.setCount, 4);
});

test('깨진 행 — 줄 번호·이유만(원본 내용 없음) · 나머지는 읽는다', () => {
  const r = parseImportFile(fx('broken.csv'));
  assert.equal(r.fatal, null);
  assert.equal(r.workouts.length, 1);
  assert.equal(r.setCount, 2);
  assert.deepEqual(
    r.issues.map((i) => [i.line, i.reason, i.column ?? null]),
    [
      [3, 'bad_date', 'Date'],
      [4, 'bad_number', 'Weight'],
      [5, 'missing_exercise_name', 'Exercise Name'],
      [6, 'column_count', null],
      [7, 'bad_set_order', 'Set Order'],
      [9, 'unterminated_quote', null],
    ],
  );
  const dump = JSON.stringify(r.issues);
  for (const leak of ['eighty', 'Bench', 'Push', 'Deadlift', '2026']) assert.ok(!dump.includes(leak), leak);
});

test('빈 파일·헤더만·모르는 형식·필수 칸 없음', () => {
  assert.equal(parseImportFile(fx('empty.csv')).fatal, 'empty');
  assert.equal(parseImportFile('\uFEFF\r\n').fatal, 'empty');
  assert.equal(parseImportFile('Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps\n').fatal, 'empty');
  assert.equal(parseImportFile('foo,bar\n1,2\n').fatal, 'unknown_format');
  const m = parseImportFile('Date,Exercise Name,Set Order\n2026-01-01 10:00:00,X,1\n');
  assert.equal(m.fatal, 'missing_columns');
  assert.deepEqual(m.missingColumns, ['Weight', 'Reps']);
});

test('파일 라벨 — 경로·확장자 제거 · 40자', () => {
  assert.equal(importFileLabel('C:\\Users\\me\\strong_export.csv'), 'strong_export');
  assert.equal(importFileLabel('/tmp/hevy.workouts.CSV'), 'hevy.workouts');
  assert.equal(Array.from(importFileLabel(`${'가'.repeat(60)}.csv`)).length, 40);
  assert.equal(importFileLabel('noext'), 'noext');
});
