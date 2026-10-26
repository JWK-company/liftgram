// /qa code M-2 — 막 만든 선호 행이 같은 id 의 원격 행에 조용히 덮이지 않는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — 라이브러리 내부 모듈(타입 없음). 동기가 실제로 쓰는 충돌 해결 함수 그대로 확인한다.
import { resolveConflict } from '@nozbe/watermelondb/sync/impl/helpers';
import { markLocalWins } from '../../sync/localWins';

const remote = { id: 'pref-seed-x', exercise_id: 'seed-x', display_name: '옛 이름', plate_one_side: null };

test('표시 없이 만든 행은 원격이 전부 이긴다(문제 재현)', () => {
  const local = { ...remote, display_name: null, plate_one_side: true, _status: 'created', _changed: '' };
  const r = resolveConflict(local, remote);
  assert.equal(r.plate_one_side, null);
});

test('markLocalWins 로 표시한 칸은 로컬이 이기고, 나머지 칸은 원격을 받는다', () => {
  const local = { ...remote, display_name: null, plate_one_side: true, _status: 'created', _changed: '' };
  markLocalWins(local, ['plate_one_side']);
  const r = resolveConflict(local, remote);
  assert.equal(r.plate_one_side, true);
  assert.equal(r.display_name, '옛 이름');
});

test('markLocalWins 는 기존 표시를 지우지 않는다(중복 없이 합친다)', () => {
  const raw = { _changed: 'display_name' };
  markLocalWins(raw, ['plate_one_side', 'display_name']);
  assert.equal(raw._changed, 'display_name,plate_one_side');
});
