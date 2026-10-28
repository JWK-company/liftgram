// @plm SRS-089  다중 탭 덮어쓰기 안전망 — lokijs 패치(트랜잭션 안 거부 · 봉인)를 실제 LokiJS + 증분 IDB 어댑터 + fake-indexeddb 로 증명한다.
//
// 「탭」 = 같은 IndexedDB 를 여는 Loki 인스턴스 둘. 패치가 없던 원래 동작(slow path 덮어쓰기)도 함께 재현해,
// 이 테스트가 실제로 소실을 잡는다는 것을 보인다(옵션을 빼면 B 가 A 의 기록을 지운다).
import 'fake-indexeddb/auto';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Watermelon 이 쓰는 그 lokijs(패치된 사본)를 Watermelon 옆에서 찾는다
const wmRequire = createRequire(createRequire(import.meta.url).resolve('@nozbe/watermelondb/package.json'));
const Loki = wmRequire('lokijs');
const IncrementalIDBAdapter = wmRequire('lokijs/src/incremental-indexeddb-adapter');

// ── 간헐 실패 처방(/qa code P4 §8) ─────────────────────────────────────────────────────────────
// 「Unable to deserialize cloned data」 — node:test 러너는 자식 프로세스의 결과를 v8 직렬화로 stdout 에 싣는다.
// Watermelon 로거가 stdout 에 [🍉] 줄을 대량으로 찍으면(전체 실행 = 자식 여럿 동시) 그 프레임과 섞일 수 있다 → 로거를 끈다.
// 또 이 파일이 연 Loki·IDB 연결을 끝에 닫는다(프로세스 종료 때 fake-indexeddb 예약 작업이 남지 않게).
createRequire(import.meta.url)('@nozbe/watermelondb/utils/common/logger').default.silence();
const opened: LokiDb[] = [];
after(async () => {
  for (const l of opened.splice(0)) {
    await new Promise<void>((res) => {
      try {
        l.close(() => res());
      } catch {
        res();
      }
      setTimeout(res, 50); // close 콜백이 없을 수도 있다
    });
  }
});

type Opts = Record<string, unknown>;
type LokiDb = {
  addCollection(n: string): { insert(d: object): void; find(): Array<{ v: string }> };
  getCollection(n: string): { insert(d: object): void; find(): Array<{ v: string }> } | null;
  saveDatabase(cb: (err?: { code?: string } | null) => void): void;
  loadDatabase(o: object, cb: (err?: unknown) => void): void;
  close(cb?: () => void): void;
  deleteDatabase(o: object, cb: (r: unknown) => void): void;
  autosaveDirty(): boolean;
};

let seq = 0;
const dbName = () => `liftgram-test-${process.pid}-${++seq}`;

/** 한 「탭」 — 디스크에서 읽은 Loki(autosave 없음 · 저장은 명시로만) */
async function openTab(name: string, adapterOptions?: Opts): Promise<{ loki: LokiDb; adapter: { _prevLokiVersionId: string | null } }> {
  const adapter = new IncrementalIDBAdapter(adapterOptions);
  const loki: LokiDb = new Loki(name, { adapter, autosave: false });
  opened.push(loki);
  await new Promise<void>((res, rej) => loki.loadDatabase({}, (e) => (e ? rej(e) : res())));
  if (!loki.getCollection('sets')) loki.addCollection('sets');
  return { loki, adapter };
}

function save(loki: LokiDb): Promise<{ code?: string } | null> {
  return new Promise((res) => loki.saveDatabase((err) => res(err ?? null)));
}

function addSet(loki: LokiDb, v: string) {
  loki.getCollection('sets')?.insert({ v });
}

/** 디스크에 있는 세트 — 새 「탭」으로 읽는다 */
async function diskSets(name: string): Promise<string[]> {
  const { loki } = await openTab(name);
  return (loki.getCollection('sets')?.find() ?? []).map((d) => d.v).sort();
}

/** 디스크 loki 청크의 versionId(직접 IDB 를 읽는다) */
function diskVersion(name: string): Promise<string | null> {
  return new Promise((res, rej) => {
    const open = indexedDB.open(name, 1);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(['LokiIncrementalData'], 'readonly').objectStore('LokiIncrementalData').get('loki');
      req.onsuccess = () => {
        db.close();
        res(req.result ? (JSON.parse(req.result.value).idbVersionId ?? null) : null);
      };
      req.onerror = () => rej(req.error);
    };
    open.onerror = () => rej(open.error);
  });
}

function guarded(extra?: Opts) {
  const calls: Array<{ prev: unknown; disk: unknown }> = [];
  let sealed = false;
  const opts: Opts = {
    rejectForeignWrites: true,
    isSealed: () => sealed,
    onForeignWrite: (info: { prev: unknown; disk: unknown }) => calls.push(info),
    ...extra,
  };
  return { opts, calls, seal: () => (sealed = true) };
}

test('패치 없음(원래 동작) — 낡은 탭의 저장이 다른 탭의 기록을 지운다(재현)', async () => {
  const name = dbName();
  const a = await openTab(name);
  const b = await openTab(name);
  addSet(a.loki, 'A1');
  assert.equal(await save(a.loki), null);
  addSet(b.loki, 'B1');
  assert.equal(await save(b.loki), null); // slow path 로 덮어씀
  assert.deepEqual(await diskSets(name), ['B1']); // A1 이 사라졌다 — 이것이 다중 탭 소실
});

test('두 탭 — A 저장 뒤 낡은 B 의 저장은 거부되고(LOKI_STALE) 디스크에는 A 내용이 그대로', async () => {
  const name = dbName();
  const ga = guarded();
  const gb = guarded();
  const a = await openTab(name, ga.opts);
  const b = await openTab(name, gb.opts);
  addSet(a.loki, 'A1');
  assert.equal(await save(a.loki), null);
  const afterA = await diskVersion(name);
  addSet(b.loki, 'B1');
  const err = await save(b.loki);
  assert.equal(err?.code, 'LOKI_STALE');
  assert.equal(gb.calls.length, 1);
  assert.equal(gb.calls[0].disk, afterA);
  assert.equal(ga.calls.length, 0);
  assert.equal(await diskVersion(name), afterA, '거부된 저장은 디스크를 바꾸지 않는다');
  assert.deepEqual(await diskSets(name), ['A1']);
  // 거부된 탭은 dirty 를 잃지 않는다(getLokiCopy 를 부르지 않았다) · prev 도 그대로
  assert.equal(b.loki.autosaveDirty(), true);
  // A 는 계속 저장할 수 있다(자기 저장 뒤 versionId 갱신)
  addSet(a.loki, 'A2');
  assert.equal(await save(a.loki), null);
  assert.deepEqual(await diskSets(name), ['A1', 'A2']);
  // B 는 다시 시도해도 계속 거부(디스크 그대로)
  assert.equal((await save(b.loki))?.code, 'LOKI_STALE');
  assert.deepEqual(await diskSets(name), ['A1', 'A2']);
});

test('거부 시 콜백은 정확히 한 번', async () => {
  const name = dbName();
  const a = await openTab(name, guarded().opts);
  const b = await openTab(name, guarded().opts);
  addSet(a.loki, 'A1');
  await save(a.loki);
  addSet(b.loki, 'B1');
  let n = 0;
  await new Promise<void>((res) => {
    b.loki.saveDatabase(() => {
      n++;
      setTimeout(res, 50);
    });
  });
  assert.equal(n, 1);
});

test('단일 탭 — 연속 저장은 거부 없이 모두 디스크에', async () => {
  const name = dbName();
  const g = guarded();
  const a = await openTab(name, g.opts);
  for (let i = 0; i < 6; i++) {
    addSet(a.loki, `S${i}`);
    assert.equal(await save(a.loki), null);
    assert.equal(a.adapter._prevLokiVersionId, await diskVersion(name), '자기 저장 뒤 prev = 디스크');
  }
  // 바뀐 게 없는 저장도 거부 없음
  assert.equal(await save(a.loki), null);
  assert.equal(g.calls.length, 0);
  assert.deepEqual(await diskSets(name), ['S0', 'S1', 'S2', 'S3', 'S4', 'S5']);
});

test('처음 빈 DB — 첫 저장이 거부되지 않는다', async () => {
  const name = dbName();
  const g = guarded();
  const a = await openTab(name, g.opts);
  assert.equal(await diskVersion(name), null);
  addSet(a.loki, 'X');
  assert.equal(await save(a.loki), null);
  assert.equal(g.calls.length, 0);
  assert.deepEqual(await diskSets(name), ['X']);
});

test('봉인 뒤 — 저장은 디스크에 닿지 않고 LOKI_SEALED · 삭제도 거부', async () => {
  const name = dbName();
  const g = guarded();
  const a = await openTab(name, g.opts);
  addSet(a.loki, 'A1');
  assert.equal(await save(a.loki), null);
  const v = await diskVersion(name);
  g.seal();
  addSet(a.loki, 'A2');
  assert.equal((await save(a.loki))?.code, 'LOKI_SEALED');
  assert.equal(await diskVersion(name), v);
  assert.equal(a.loki.autosaveDirty(), true);
  const del = await new Promise<{ success?: boolean } | undefined>((res) =>
    a.loki.deleteDatabase({}, (r) => res(r as { success?: boolean })),
  );
  assert.equal(del?.success, false);
  assert.deepEqual(await diskSets(name), ['A1']);
});

test('동시 저장 — 같은 버전에서 출발한 두 탭이 함께 저장하면 하나만 이기고 slow path 는 0번', async () => {
  const name = dbName();
  const seedTab = await openTab(name, guarded().opts);
  addSet(seedTab.loki, 'base');
  await save(seedTab.loki);
  const ga = guarded();
  const gb = guarded();
  const a = await openTab(name, ga.opts);
  const b = await openTab(name, gb.opts);
  addSet(a.loki, 'A');
  addSet(b.loki, 'B');
  const [ea, eb] = await Promise.all([save(a.loki), save(b.loki)]);
  const results = [ea?.code ?? 'ok', eb?.code ?? 'ok'].sort();
  assert.deepEqual(results, ['LOKI_STALE', 'ok']);
  const winner = ea ? 'B' : 'A';
  assert.deepEqual(await diskSets(name), ['base', winner].sort());
});

test('같은 탭 리셋(계정 전환) — 지우고 새 어댑터로 다시 열면 첫 저장이 거부되지 않는다', async () => {
  const name = dbName();
  const g = guarded();
  const opts = g.opts; // Watermelon 은 리셋 때 같은 extraIncrementalIDBOptions 로 새 어댑터를 만든다
  const a = await openTab(name, opts);
  addSet(a.loki, 'old');
  await save(a.loki);
  // DatabaseDriver.unsafeResetDatabase 와 같은 순서: close → deleteDatabase → newLoki(load)
  await new Promise<void>((res, rej) =>
    a.loki.close(() =>
      a.loki.deleteDatabase({}, (r) => ((r as { success?: boolean })?.success ? res() : rej(r))),
    ),
  );
  const fresh = await openTab(name, opts);
  assert.equal(fresh.adapter._prevLokiVersionId, null);
  assert.equal(await diskVersion(name), null);
  addSet(fresh.loki, 'new');
  assert.equal(await save(fresh.loki), null);
  addSet(fresh.loki, 'new2');
  assert.equal(await save(fresh.loki), null);
  assert.equal(g.calls.length, 0);
  assert.deepEqual(await diskSets(name), ['new', 'new2']);
});

test('다른 탭이 DB 를 지우면 — 남은 탭의 저장은 거부(지워진 기록을 되살려 덮지 않는다)', async () => {
  const name = dbName();
  const ga = guarded();
  const gb = guarded();
  const versionchange: string[] = [];
  const a = await openTab(name, { ...ga.opts, onversionchange: () => versionchange.push('a') });
  addSet(a.loki, 'A1');
  await save(a.loki);
  const b = await openTab(name, gb.opts);
  // B 가 리셋 → A 에 versionchange
  await new Promise<void>((res) => b.loki.close(() => b.loki.deleteDatabase({}, () => res())));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(versionchange, ['a']);
  const b2 = await openTab(name, gb.opts);
  addSet(b2.loki, 'B-new');
  assert.equal(await save(b2.loki), null);
  addSet(a.loki, 'A2');
  assert.equal((await save(a.loki))?.code, 'LOKI_STALE');
  assert.deepEqual(await diskSets(name), ['B-new']);
});

test('core 쓰기 문 — lokiGateOptions 의 거부가 문을 닫고, 닫힌 문은 저장을 막는다', async () => {
  const { lokiGateOptions, isLocalDbSealed, getSealInfo, subscribeSeal, __resetWriteGateForTests } = await import(
    '../../db/writeGate'
  );
  __resetWriteGateForTests();
  const name = dbName();
  const a = await openTab(name); // 다른 탭(옵션 없음)
  const b = await openTab(name, lokiGateOptions());
  const seen: string[] = [];
  subscribeSeal((i) => seen.push(i.reason));
  addSet(a.loki, 'A1');
  await save(a.loki);
  assert.equal(isLocalDbSealed(), false);
  addSet(b.loki, 'B1');
  assert.equal((await save(b.loki))?.code, 'LOKI_STALE');
  assert.equal(isLocalDbSealed(), true);
  assert.equal(getSealInfo()?.reason, 'stale');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['stale']);
  // 봉인 뒤에는 IDB 에 닿지도 않는다
  assert.equal((await save(b.loki))?.code, 'LOKI_SEALED');
  assert.deepEqual(await diskSets(name), ['A1']);
  __resetWriteGateForTests();
});

// ── 실제 Watermelon LokiJSAdapter(앱과 같은 증분 IDB 경로 · extraIncrementalIDBOptions) ──────────────────────────
const { default: LokiJSAdapter } = await import('@nozbe/watermelondb/adapters/lokijs');
const { appSchema, tableSchema } = await import('@nozbe/watermelondb');

const tinySchema = appSchema({
  version: 1,
  tables: [tableSchema({ name: 'sets', columns: [{ name: 'v', type: 'string' }] })],
});

type WmAdapter = {
  batch(ops: unknown[], cb: (r: { error?: unknown }) => void): void;
  unsafeResetDatabase(cb: (r: { error?: unknown }) => void): void;
  query(q: unknown, cb: (r: { value?: unknown[]; error?: unknown }) => void): void;
  _driver?: { loki?: LokiDb };
};

async function openWm(name: string): Promise<WmAdapter> {
  const { lokiGateOptions } = await import('../../db/writeGate');
  const adapter = new LokiJSAdapter({
    schema: tinySchema,
    useWebWorker: false,
    useIncrementalIndexedDB: true,
    dbName: name,
    extraLokiOptions: { autosave: false },
    extraIncrementalIDBOptions: lokiGateOptions(),
  }) as unknown as WmAdapter;
  // setUp 이 끝날 때까지(첫 질의가 줄을 선다)
  await wmBatch(adapter, []);
  if (adapter._driver?.loki) opened.push(adapter._driver.loki);
  return adapter;
}

function wmBatch(adapter: WmAdapter, ops: unknown[]): Promise<void> {
  return new Promise((res, rej) => adapter.batch(ops, (r) => (r.error ? rej(r.error) : res())));
}

function wmCreate(adapter: WmAdapter, id: string) {
  return wmBatch(adapter, [['create', 'sets', { id, _status: 'created', _changed: '', v: id }]]);
}

function wmSave(adapter: WmAdapter): Promise<{ code?: string } | null> {
  const loki = adapter._driver?.loki;
  assert.ok(loki, 'Loki 핸들(localDb.findLoki 와 같은 경로)');
  return save(loki);
}

test('Watermelon 어댑터 — 계정 전환 리셋(unsafeResetDatabase) 뒤 새 Loki 도 문을 이어받고, 첫 저장이 거짓 거부되지 않는다', async () => {
  const { __resetWriteGateForTests, isLocalDbSealed } = await import('../../db/writeGate');
  __resetWriteGateForTests();
  const name = dbName();
  const a = await openWm(name);
  await wmCreate(a, 'before');
  assert.equal(await wmSave(a), null);
  await new Promise<void>((res, rej) => a.unsafeResetDatabase((r) => (r.error ? rej(r.error) : res())));
  await wmCreate(a, 'after');
  assert.equal(await wmSave(a), null);
  await wmCreate(a, 'after2');
  assert.equal(await wmSave(a), null);
  assert.equal(isLocalDbSealed(), false);
  assert.deepEqual(await diskSetIds(name), ['after', 'after2']);
  __resetWriteGateForTests();
});

test('Watermelon 어댑터 — 두 탭: 낡은 탭은 봉인되고, 봉인 탭의 리셋은 공유 DB 를 지우지 못한다', async () => {
  const { __resetWriteGateForTests, isLocalDbSealed } = await import('../../db/writeGate');
  __resetWriteGateForTests();
  const name = dbName();
  const other = await openTab(name); // 다른 탭(앞서 저장)
  const mine = await openWm(name);
  addSet(other.loki, 'x'); // 다른 컬렉션 이름이라도 loki 청크 versionId 는 바뀐다
  assert.equal(await save(other.loki), null);
  await wmCreate(mine, 'mine');
  assert.equal((await wmSave(mine))?.code, 'LOKI_STALE');
  assert.equal(isLocalDbSealed(), true);
  const before = await diskVersion(name);
  // 봉인된 탭의 리셋은 공유 DB 를 지우지 못한다
  const reset = await new Promise<{ error?: unknown }>((res) => mine.unsafeResetDatabase(res));
  assert.ok(reset.error, '봉인 탭의 리셋은 실패해야 한다');
  assert.equal(await diskVersion(name), before);
  __resetWriteGateForTests();
});

async function diskSetIds(name: string): Promise<string[]> {
  const { loki } = await openTab(name);
  return ((loki.getCollection('sets')?.find() ?? []) as unknown as Array<{ id: string }>).map((d) => d.id).sort();
}

test('미리 렌더 보류(/qa code P4 M-2) — 보류 중 저장은 디스크에 닿지 않고 dirty 가 남으며, 풀면 이어 저장된다 · 봉인과 달리 되돌릴 수 있다', async () => {
  const {
    __resetWriteGateForTests,
    holdLocalDbDisk,
    releaseLocalDbDisk,
    isLocalDbSealed,
    acceptsLocalDbWrites,
    whenLocalDbDiskOpen,
    lokiGateOptions,
  } = await import('../../db/writeGate');
  __resetWriteGateForTests();
  const name = dbName();
  holdLocalDbDisk();
  const p = await openTab(name, lokiGateOptions());
  addSet(p.loki, 'P1');
  assert.equal((await save(p.loki))?.code, 'LOKI_SEALED');
  assert.equal(await diskVersion(name), null, '보류 중에는 디스크에 아무것도 없다');
  assert.equal(p.loki.autosaveDirty(), true);
  // 메모리 쓰기는 받는다 · 봉인이 아니다
  assert.equal(acceptsLocalDbWrites(), true);
  assert.equal(isLocalDbSealed(), false);
  let opened = false;
  const waiting = whenLocalDbDiskOpen().then(() => (opened = true));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(opened, false, '보류가 풀리기 전에는 기다린다');
  releaseLocalDbDisk();
  await waiting;
  assert.equal(await save(p.loki), null);
  assert.deepEqual(await diskSets(name), ['P1']);
  __resetWriteGateForTests();
});

test('미리 렌더 보류 — 보류 중 다른 탭이 저장했으면 풀린 뒤 첫 저장은 거부(덮어쓰지 않음)', async () => {
  const { __resetWriteGateForTests, holdLocalDbDisk, releaseLocalDbDisk, isLocalDbSealed, lokiGateOptions } = await import(
    '../../db/writeGate'
  );
  __resetWriteGateForTests();
  const name = dbName();
  const m = await openTab(name); // 열려 있던 주인 탭(옵션 없음)
  addSet(m.loki, 'M0');
  await save(m.loki);
  holdLocalDbDisk();
  const p = await openTab(name, lokiGateOptions());
  addSet(p.loki, 'P1');
  await save(p.loki); // 보류 — 거부(LOKI_SEALED)
  addSet(m.loki, 'M1');
  assert.equal(await save(m.loki), null, '주인 탭은 미리 렌더 문서 때문에 거부되지 않는다');
  releaseLocalDbDisk();
  assert.equal((await save(p.loki))?.code, 'LOKI_STALE');
  assert.equal(isLocalDbSealed(), true);
  assert.deepEqual(await diskSets(name), ['M0', 'M1']);
  __resetWriteGateForTests();
});

test('프레임 판정 — 문서가 없는 환경(node·네이티브)은 프레임이 아니다', async () => {
  const { isFramedDocument } = await import('../../db/writeGate');
  assert.equal(isFramedDocument(), false);
});
