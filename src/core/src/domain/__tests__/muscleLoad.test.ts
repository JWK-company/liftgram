// @plm SRS-075 SRS-076 ADR-039  근육별 세트 집계 경계 — `bun run test:core`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SECONDARY_WEIGHT,
  MAP_MUSCLES,
  setsByMuscle,
  addMuscleLoad,
  totalMuscleSets,
  rankedMuscles,
  untrained,
  topMuscles,
  topMusclesLabel,
  muscleShadeLevel,
  primarySecondaryMuscles,
  emptyMuscleLoad,
  type MuscleLoadItem,
} from '../muscleLoad';
import type { MuscleGroup } from '../types';

const bench: Pick<MuscleLoadItem, 'primaryMuscles' | 'secondaryMuscles'> = {
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'shoulders'],
};
const squat: Pick<MuscleLoadItem, 'primaryMuscles' | 'secondaryMuscles'> = {
  primaryMuscles: ['quads', 'glutes'],
  secondaryMuscles: ['hamstrings'],
};

test('가중치 상수 = 0.5, 그림 구역 = 12(fullBody·other 제외)', () => {
  assert.equal(SECONDARY_WEIGHT, 0.5);
  assert.equal(MAP_MUSCLES.length, 12);
  assert.ok(!(MAP_MUSCLES as string[]).includes('fullBody'));
  assert.ok(!(MAP_MUSCLES as string[]).includes('other'));
});

test('벤치 1세트 = 가슴 1 · 삼두 0.5 · 어깨 0.5, 나머지 0', () => {
  const l = setsByMuscle([{ ...bench }]);
  assert.equal(l.byMuscle.chest, 1);
  assert.equal(l.byMuscle.triceps, 0.5);
  assert.equal(l.byMuscle.shoulders, 0.5);
  assert.equal(l.byMuscle.back, 0);
  assert.equal(l.fullBody, 0);
  assert.equal(totalMuscleSets(l), 2);
});

test('sets 로 여러 세트를 한 줄에 — 벤치 3세트 + 스쿼트 4세트', () => {
  const l = setsByMuscle([
    { ...bench, sets: 3 },
    { ...squat, sets: 4 },
  ]);
  assert.equal(l.byMuscle.chest, 3);
  assert.equal(l.byMuscle.triceps, 1.5);
  assert.equal(l.byMuscle.quads, 4);
  assert.equal(l.byMuscle.glutes, 4);
  assert.equal(l.byMuscle.hamstrings, 2);
});

test('워밍업 제외 — is_warmup · 처방 set_type=warmup', () => {
  const l = setsByMuscle([
    { ...bench, isWarmup: true },
    { ...bench, setType: 'warmup' },
    { ...bench, setType: 'top' },
    { ...bench, setType: 'backoff', isWarmup: false },
  ]);
  assert.equal(l.byMuscle.chest, 2);
});

test('커스텀 종목 other 는 어디에도 세지 않는다', () => {
  const l = setsByMuscle([{ primaryMuscles: ['other'], secondaryMuscles: [] }, { primaryMuscles: ['other'] }]);
  assert.equal(totalMuscleSets(l), 0);
  assert.equal(l.fullBody, 0);
  assert.equal(untrained(l).length, 12);
});

test('fullBody 는 그림 밖 별도 숫자(주 1 · 보조 0.5) — 개별 근육은 칠하지 않음', () => {
  const l = setsByMuscle([
    { primaryMuscles: ['fullBody'], secondaryMuscles: ['back'] },
    { primaryMuscles: ['quads'], secondaryMuscles: ['fullBody'] },
  ]);
  assert.equal(l.fullBody, 1.5);
  assert.equal(l.byMuscle.back, 0.5);
  assert.equal(l.byMuscle.quads, 1);
  assert.ok(untrained(l).includes('chest'));
});

test('주·보조 중복·목록 안 중복은 한 번(주 우선)', () => {
  const l = setsByMuscle([{ primaryMuscles: ['chest', 'chest'], secondaryMuscles: ['chest', 'triceps', 'triceps'] }]);
  assert.equal(l.byMuscle.chest, 1);
  assert.equal(l.byMuscle.triceps, 0.5);
});

test('빈·이상 입력 방어 — null 근육·0·음수·NaN 세트는 무시, 모르는 근육 문자열도 무시', () => {
  const l = setsByMuscle([
    { primaryMuscles: null, secondaryMuscles: undefined },
    { ...bench, sets: 0 },
    { ...bench, sets: -2 },
    { ...bench, sets: Number.NaN },
    { primaryMuscles: ['neck' as MuscleGroup] },
  ]);
  assert.equal(totalMuscleSets(l), 0);
  assert.deepEqual(setsByMuscle([]), emptyMuscleLoad());
});

test('untrained — 0 인 12구역 목록(순서 = ALL_MUSCLE_GROUPS)', () => {
  const l = setsByMuscle([{ ...bench }, { ...squat }]);
  const u = untrained(l);
  assert.deepEqual(u, ['back', 'biceps', 'forearms', 'calves', 'abs', 'traps']);
});

test('rankedMuscles·topMuscles — 많은 순, 같으면 카탈로그 순서', () => {
  const l = setsByMuscle([{ ...bench, sets: 3 }]);
  assert.deepEqual(
    rankedMuscles(l).map((r) => [r.muscle, r.sets]),
    [
      ['chest', 3],
      ['shoulders', 1.5],
      ['triceps', 1.5],
    ],
  );
  assert.deepEqual(topMuscles(l), ['chest', 'shoulders']);
  assert.deepEqual(topMuscles(l, 1), ['chest']);
  assert.deepEqual(topMuscles(emptyMuscleLoad()), []);
});

test('topMusclesLabel — 근육 이름만 잇는다(문장은 화면 i18n muscleMap.focus)', () => {
  const l = setsByMuscle([{ primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], sets: 4 }]);
  assert.equal(topMusclesLabel(l, 'ko'), '가슴·삼두');
  assert.equal(topMusclesLabel(l, 'en'), 'Chest · Triceps');
  assert.equal(topMusclesLabel(emptyMuscleLoad()), null);
});

test('addMuscleLoad — 기간 합산', () => {
  const a = setsByMuscle([{ ...bench }]);
  const b = setsByMuscle([{ ...bench }, { primaryMuscles: ['fullBody'] }]);
  const s = addMuscleLoad(a, b);
  assert.equal(s.byMuscle.chest, 2);
  assert.equal(s.fullBody, 1);
});

test('muscleShadeLevel — 최대 대비 3단계, 0 = 안 함', () => {
  const l = setsByMuscle([
    { primaryMuscles: ['chest'], sets: 9 },
    { primaryMuscles: ['back'], sets: 5 },
    { primaryMuscles: ['biceps'], sets: 2 },
  ]);
  assert.equal(muscleShadeLevel(l, 'chest'), 3);
  assert.equal(muscleShadeLevel(l, 'back'), 2);
  assert.equal(muscleShadeLevel(l, 'biceps'), 1);
  assert.equal(muscleShadeLevel(l, 'calves'), 0);
});

test('primarySecondaryMuscles — 미니 그림 2단계(주에 있으면 보조에서 뺀다 · fullBody/other 제외)', () => {
  const r = primarySecondaryMuscles([bench, { primaryMuscles: ['triceps'], secondaryMuscles: ['fullBody', 'other'] }]);
  assert.deepEqual(r.primary, ['chest', 'triceps']);
  assert.deepEqual(r.secondary, ['shoulders']);
});
