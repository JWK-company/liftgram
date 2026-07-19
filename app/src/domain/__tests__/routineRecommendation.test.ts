// 오늘의 추천 루틴 순수 도메인 테스트 (SRS-034) — `npm test` (node --import tsx --test). RN 불필요.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recommendTodayRoutine,
  dominantMuscle,
  type RecoWorkout,
} from '../routineRecommendation';
import type { MuscleGroup } from '../types';

const at = (y: number, m: number, day: number) => new Date(y, m, day, 12, 0).getTime();

// 편의: 한 세션 = 대표부위 muscle을 반복한 primaryMuscles + 루틴 지정.
function w(y: number, m: number, day: number, muscle: MuscleGroup, routineId: string | null, routineName: string | null): RecoWorkout {
  return { completedAtMs: at(y, m, day), routineId, routineName, primaryMuscles: [muscle, muscle] };
}

test('dominantMuscle: 최빈 근육, 동률이면 먼저 등장한 쪽', () => {
  assert.equal(dominantMuscle([]), null);
  assert.equal(dominantMuscle(['chest', 'chest', 'triceps']), 'chest');
  assert.equal(dominantMuscle(['back', 'biceps', 'biceps']), 'biceps');
  assert.equal(dominantMuscle(['shoulders', 'chest']), 'shoulders'); // 동률 → 먼저 등장
});

test('기록 부족(운동일<4)이면 insufficient', () => {
  const entries = [
    w(2026, 6, 1, 'chest', 'r1', '가슴 A'),
    w(2026, 6, 3, 'back', 'r2', '등 A'),
    w(2026, 6, 5, 'shoulders', 'r3', '어깨 A'),
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 7));
  assert.equal(rec.status, 'insufficient');
});

test('기간<일주일(span<6)이면 insufficient', () => {
  const entries = [
    w(2026, 6, 1, 'chest', 'r1', '가슴 A'),
    w(2026, 6, 2, 'back', 'r2', '등 A'),
    w(2026, 6, 3, 'shoulders', 'r3', '어깨 A'),
    w(2026, 6, 4, 'quads', 'r4', '하체 A'),
  ]; // 4일이지만 span=3
  const rec = recommendTodayRoutine(entries, at(2026, 6, 6));
  assert.equal(rec.status, 'insufficient');
});

test('5분할 회전: 직전이 하체면 다음은 팔(전이 예측) + 팔의 최신 루틴', () => {
  // chest→back→shoulders→quads→biceps 를 두 사이클 (2주)
  const entries = [
    w(2026, 6, 1, 'chest', 'c', '가슴'),
    w(2026, 6, 2, 'back', 'b', '등'),
    w(2026, 6, 3, 'shoulders', 's', '어깨'),
    w(2026, 6, 4, 'quads', 'q', '하체'),
    w(2026, 6, 5, 'biceps', 'a', '팔'),
    w(2026, 6, 8, 'chest', 'c', '가슴'),
    w(2026, 6, 9, 'back', 'b', '등'),
    w(2026, 6, 10, 'shoulders', 's', '어깨'),
    w(2026, 6, 11, 'quads', 'q', '하체'), // 직전 = 하체
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 13));
  assert.equal(rec.status, 'ok');
  assert.equal(rec.muscle, 'biceps');
  assert.equal(rec.routineId, 'a');
  assert.equal(rec.routineName, '팔');
});

test('해당 부위의 가장 최신 루틴 버전을 추천(등 루틴을 새로 만들어 수행)', () => {
  // 등을 처음엔 r-back-old, 두 번째 사이클에 새 루틴 r-back-new 로 수행 → 최신 것 추천
  const entries = [
    w(2026, 6, 1, 'chest', 'c', '가슴'),
    w(2026, 6, 2, 'back', 'r-back-old', '등 구버전'),
    w(2026, 6, 3, 'shoulders', 's', '어깨'),
    w(2026, 6, 8, 'chest', 'c', '가슴'), // 직전 = 가슴
    w(2026, 6, 9, 'back', 'r-back-new', '등 신버전'),
    w(2026, 6, 10, 'shoulders', 's', '어깨'),
    w(2026, 6, 15, 'chest', 'c', '가슴'), // 직전 = 가슴 → 다음은 등
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 17));
  assert.equal(rec.status, 'ok');
  assert.equal(rec.muscle, 'back');
  assert.equal(rec.routineId, 'r-back-new');
  assert.equal(rec.routineName, '등 신버전');
});

test('일회성 부위(abs 한 번)는 전이 예측을 지배하지 않는다', () => {
  // 안정적 3분할 chest/back/legs + 오래 전 abs 1회 → 직전이 chest면 다음은 back(전이), abs 아님
  const entries = [
    w(2026, 5, 20, 'abs', 'ab', '복근'), // 오래 전 1회
    w(2026, 6, 1, 'chest', 'c', '가슴'),
    w(2026, 6, 3, 'back', 'b', '등'),
    w(2026, 6, 5, 'quads', 'q', '하체'),
    w(2026, 6, 8, 'chest', 'c', '가슴'),
    w(2026, 6, 10, 'back', 'b', '등'),
    w(2026, 6, 12, 'quads', 'q', '하체'),
    w(2026, 6, 15, 'chest', 'c', '가슴'), // 직전 = 가슴
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 17));
  assert.equal(rec.status, 'ok');
  assert.equal(rec.muscle, 'back'); // abs 아님
  assert.equal(rec.routineId, 'b');
});

test('풀바디 반복: 항상 같은 루틴의 최신 버전 추천', () => {
  const entries = [
    w(2026, 6, 1, 'fullBody', 'fb', '전신 A'),
    w(2026, 6, 3, 'fullBody', 'fb', '전신 A'),
    w(2026, 6, 5, 'fullBody', 'fb', '전신 A'),
    w(2026, 6, 8, 'fullBody', 'fb', '전신 A'),
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 10));
  assert.equal(rec.status, 'ok');
  assert.equal(rec.muscle, 'fullBody');
  assert.equal(rec.routineId, 'fb');
});

test('추천 부위가 프리스타일(루틴 없음)이면 다음 후보의 루틴으로 폴백', () => {
  // 예측 1순위 back이 프리스타일(routine null)뿐 → 다음 후보(오래 쉰 순)로 폴백
  const entries = [
    w(2026, 6, 1, 'chest', 'c', '가슴'),
    w(2026, 6, 2, 'back', null, null), // 등은 항상 프리스타일
    w(2026, 6, 3, 'quads', 'q', '하체'),
    w(2026, 6, 8, 'chest', 'c', '가슴'),
    w(2026, 6, 9, 'back', null, null),
    w(2026, 6, 10, 'quads', 'q', '하체'),
    w(2026, 6, 15, 'chest', 'c', '가슴'), // 직전 = 가슴 → 1순위 back(루틴 없음) → 폴백
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 17));
  assert.equal(rec.status, 'ok');
  assert.notEqual(rec.muscle, 'back'); // back은 추천 불가 → 다른 부위
  assert.ok(rec.routineId);
});

test('삭제된 루틴(routineName=null)은 추천하지 않는다', () => {
  // repo 계약: 루틴이 삭제되면 routineId/routineName 모두 null 로 넘어온다.
  const entries = [
    w(2026, 6, 1, 'chest', 'c', '가슴'),
    w(2026, 6, 2, 'back', null, null), // 삭제된 등 루틴
    w(2026, 6, 3, 'quads', 'q', '하체'),
    w(2026, 6, 8, 'chest', 'c', '가슴'),
    w(2026, 6, 9, 'back', null, null),
    w(2026, 6, 10, 'quads', 'q', '하체'),
    w(2026, 6, 15, 'chest', 'c', '가슴'),
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 17));
  assert.equal(rec.status, 'ok');
  assert.notEqual(rec.muscle, 'back');
});

test('오늘 이미 운동한 세션은 예측에서 제외(다음 부위 예측)', () => {
  // 오늘(6/15) 가슴을 이미 함 → 예측은 그 이전 기준. 직전(과거) = 하체 → 다음 = 팔
  const entries = [
    w(2026, 6, 1, 'chest', 'c', '가슴'),
    w(2026, 6, 2, 'quads', 'q', '하체'),
    w(2026, 6, 3, 'biceps', 'a', '팔'),
    w(2026, 6, 8, 'chest', 'c', '가슴'),
    w(2026, 6, 9, 'quads', 'q', '하체'), // 과거 직전 = 하체
    w(2026, 6, 15, 'chest', 'c', '가슴'), // 오늘 — 제외
  ];
  const rec = recommendTodayRoutine(entries, at(2026, 6, 15));
  assert.equal(rec.status, 'ok');
  assert.equal(rec.muscle, 'biceps');
});

test('기록 전무면 insufficient', () => {
  assert.equal(recommendTodayRoutine([], at(2026, 6, 15)).status, 'insufficient');
});
