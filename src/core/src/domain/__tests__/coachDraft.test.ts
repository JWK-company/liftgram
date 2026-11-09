// SPEC-050 P3b 코치 초안 — 저장소(실제 WatermelonDB · LokiJS 메모리).
// 초안은 내 목록에 안 보이고(is_archived) 회원별로 모인다 · 보낼 내용은 계약 모양(0 = 없음 · 순서 다시 매김 · 처방 JSON) ·
// 줄을 지우면 루틴 행을 움직여 「보내지 않은 변경」이 보인다 · 직접 만든 종목은 미리 알린다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const routineRepo = await import('../../data/routineRepository');
const draft = await import('../../data/coachDraft');

type Raw = Record<string, unknown>;

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

async function create(table: string, raw: Raw): Promise<string> {
  let id = '';
  await database.write(async () => {
    const rec = await database.get(table).create((r) => {
      Object.assign(r._raw as unknown as Raw, raw);
    });
    id = rec.id;
  });
  return id;
}

test('초안 — 내 목록엔 없고 회원별로 모인다 · 출처 없음', async () => {
  await reset();
  await routineRepo.createRoutine({ name: '내 루틴' });
  const d = await draft.createCoachDraft('member-1', '  상체 A ');
  await draft.createCoachDraft('member-2', '');
  const raw = d._raw as unknown as Raw;
  assert.deepEqual([raw.name, raw.is_archived, raw.coach_for, raw.origin], ['상체 A', true, 'member-1', null]);
  assert.equal(draft.isCoachDraft(d), true);
  assert.deepEqual(
    (await routineRepo.queryRoutines().fetch()).map((r) => r.name),
    ['내 루틴'],
  );
  const mine = await draft.queryCoachDrafts('member-1').fetch();
  assert.deepEqual(
    mine.map((r) => r.id),
    [d.id],
  );
  assert.equal(routineRepo.isCoachLocked(d), false); // 코치 기기에선 잠기지 않는다
});

test('보낼 내용 — 계약 모양 · 0 = 없음 · 순서 다시 매김 · 처방·유산소 JSON · 변형은 싣지 않음', async () => {
  await reset();
  const d = await draft.createCoachDraft('member-1', '하체');
  await routineRepo.updateRoutine(d.id, { notes: '천천히' });
  const [a, b] = await routineRepo.addExercisesToRoutine(d.id, ['ex-squat', 'ex-bike']);
  await routineRepo.setRoutineExercisePrescription(a.id, [
    { setType: 'top', targetRir: 1, repMin: 5, repMax: 5, loadHint: null, rest: 240 },
  ]);
  await routineRepo.updateRoutineExercise(b.id, { cardioTarget: { durationSec: 600, distanceM: null, incline: null, level: null } });
  await routineRepo.setRoutineExerciseVariant(a.id, { grip: 'wide' });
  const out = await draft.coachDraftSendInput(d.id);
  assert.equal(out.sourceRoutineId, d.id);
  assert.equal(out.name, '하체');
  assert.equal(out.notes, '천천히');
  assert.deepEqual(
    out.lines.map((l) => [l.id, l.exerciseId, l.sortOrder]),
    [
      [a.id, 'ex-squat', 0],
      [b.id, 'ex-bike', 1],
    ],
  );
  const rx = JSON.parse(out.lines[0].prescriptionJson) as Raw[];
  assert.equal(rx[0].setType, 'top');
  assert.equal(rx[0].rest, 240);
  assert.equal(JSON.parse(out.lines[1].cardioTargetJson).durationSec, 600);
  assert.equal(out.lines[1].prescriptionJson, '');
  assert.equal(out.lines[0].targetWeightKg, 0);
  assert.equal(JSON.stringify(out).includes('wide'), false, '변형 칸은 싣지 않는다');
});

test('줄을 지우면 루틴 행이 움직여 「고친 때」가 늦어진다 · 초안이 아니면 손대지 않는다', async () => {
  await reset();
  const d = await draft.createCoachDraft('member-1', '등');
  const [a] = await routineRepo.addExercisesToRoutine(d.id, ['ex-row']);
  const before = await draft.coachDraftEditedAt(d.id);
  await new Promise((r) => setTimeout(r, 5));
  await routineRepo.removeRoutineExercise(a.id);
  await draft.touchCoachDraft(d.id);
  assert.ok((await draft.coachDraftEditedAt(d.id)) > before);

  const mine = await routineRepo.createRoutine({ name: '내 루틴' });
  const at = (mine._raw as unknown as Raw).updated_at;
  await new Promise((r) => setTimeout(r, 5));
  await draft.touchCoachDraft(mine.id);
  assert.equal((await routineRepo.getRoutine(mine.id))._raw.updated_at as unknown, at);
});

test('직접 만든 종목이 있으면 그 이름', async () => {
  await reset();
  const custom = await create('exercises', {
    name_ko: '내 동작',
    is_custom: true,
    is_archived: false,
    equipment: 'other',
    primary_muscles: '[]',
  });
  const d = await draft.createCoachDraft('member-1', '팔');
  assert.equal(await draft.coachDraftCustomExercise(d.id), null);
  await routineRepo.addExercisesToRoutine(d.id, [custom]);
  assert.deepEqual(await draft.coachDraftCustomExercise(d.id), { id: custom, nameKo: '내 동작' });
});

test('보낼 내용 지문 — 같은 내용이면 같고(보기만·같은 이름 다시 쓰기) 줄·이름·처방이 바뀌면 다르다', async () => {
  await reset();
  const d = await draft.createCoachDraft('member-1', '하체');
  const [a] = await routineRepo.addExercisesToRoutine(d.id, ['ex-squat']);
  const h0 = draft.coachDraftHash(await draft.coachDraftSendInput(d.id));
  await new Promise((r) => setTimeout(r, 5));
  await routineRepo.updateRoutine(d.id, { name: '하체' }); // 같은 이름 다시 쓰기 — 시계는 움직여도 지문은 그대로
  await draft.touchCoachDraft(d.id);
  assert.equal(draft.coachDraftHash(await draft.coachDraftSendInput(d.id)), h0);
  await routineRepo.updateRoutine(d.id, { name: '하체 B' });
  const h1 = draft.coachDraftHash(await draft.coachDraftSendInput(d.id));
  assert.notEqual(h1, h0);
  await routineRepo.updateRoutineExercise(a.id, { targetSets: 5 });
  const h2 = draft.coachDraftHash(await draft.coachDraftSendInput(d.id));
  assert.notEqual(h2, h1);
  await routineRepo.removeRoutineExercise(a.id);
  assert.notEqual(draft.coachDraftHash(await draft.coachDraftSendInput(d.id)), h2);
});

test('폴더 이름 목록에 코치 초안의 폴더는 섞이지 않는다', async () => {
  await reset();
  await routineRepo.createRoutine({ name: '내 루틴', folder: '상체' });
  const d = await draft.createCoachDraft('member-1', '초안');
  await database.write(async () => {
    await d.update((r) => {
      r.folder = '회원 폴더';
    });
  });
  assert.deepEqual(await routineRepo.getFolderNames(), ['상체']);
});
