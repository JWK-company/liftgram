// 웹 DB 어댑터 — LokiJS + IndexedDB(영속). 웹은 네이티브 SQLite/JSI를 못 쓰므로 LokiJS로 대체.
// Metro가 웹 플랫폼 빌드에서 adapter.ts 대신 이 파일을 해석한다(.web.ts 우선).
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { mySchema, SCHEMA_VERSION } from './schema';
import migrations from './migrations';
import { checkSchemaGuardOnBoot } from './schemaGuard';
import { holdLocalDbDisk, isFramedDocument, lokiGateOptions, releaseLocalDbDisk } from './writeGate';

/** 진짜 기록 DB 이름 — 바꾸면 기기의 모든 기록을 잃는다. */
const DB_NAME = 'repset';
/**
 * 다운그레이드로 막혔을 때 대신 여는 **버리는** DB 이름(D-5).
 * 진짜 DB(`repset`)를 열면 LokiJS 가 「더 새 버전」을 보고 지워 버리므로, 아예 다른 이름을 연다.
 * 자동 저장도 끈다 — 이 실행에서 생기는 것은 남길 이유가 없다. @plm SRS-073 SAD-023
 */
const GUARD_DB_NAME = 'repset-schema-guard';
/**
 * 프레임(iframe) 문서가 대신 여는 **버리는** DB 이름(/qa code P4 M-1). 진짜 DB 를 열지 않으므로 이 문서가 무엇을 하든
 * 다른 탭의 기록·쓰기 주인과 무관하다. 자동 저장도 끈다. @plm SRS-089
 */
const FRAMED_DB_NAME = 'repset-framed';

export function buildAdapter() {
  // 프레임 안 문서(서비스워커 찌르기 iframe 이 오프라인 대체로 앱 셸을 받은 경우 등)는 진짜 DB 를 열지 않는다(/qa code P4 M-1) @plm SRS-089
  if (isFramedDocument()) {
    console.warn('[DB] 프레임 안 문서 — 진짜 기기 DB 를 열지 않는다(버리는 빈 DB)');
    return new LokiJSAdapter({
      schema: mySchema,
      migrations,
      useWebWorker: false,
      useIncrementalIndexedDB: true,
      dbName: FRAMED_DB_NAME,
      extraLokiOptions: { autosave: false },
      onSetUpError: (error: Error) => {
        console.error('[DB] LokiJS(프레임용 빈 DB) setup failed', error);
      },
    });
  }
  // 주소창 미리 렌더(prerender) 문서는 활성화 전까지 디스크에 닿지 않는다(/qa code P4 M-2) — 사용자가 열지도 않은 문서가
  // 디스크 versionId 를 바꾸면 이미 열려 있던 주인 탭이 거짓 STALE 로 새로고침한다. 보류는 되돌릴 수 있다: 메모리 쓰기는 받고,
  // 활성화(prerenderingchange) 때 풀어 autosave 가 이어 쓴다(그사이 디스크가 바뀌었으면 패치가 거부 → 이 탭이 1회 새로고침).
  // Speculation Rules 로 끄는 안은 쓰지 않았다 — 주소창 미리 렌더는 브라우저가 시작해 페이지 규칙으로 막을 수 없다. @plm SRS-089
  const doc = typeof document !== 'undefined' ? (document as Document & { prerendering?: boolean }) : null;
  if (doc?.prerendering) {
    holdLocalDbDisk();
    doc.addEventListener('prerenderingchange', () => releaseLocalDbDisk(), { once: true });
  }
  // 다운그레이드 가드 — **DB 를 열기 전에** 판정하고 이 기기에서 본 최고 스키마 버전을 남긴다(D-5). @plm SRS-073 SAD-023
  const guard = checkSchemaGuardOnBoot(SCHEMA_VERSION);
  if (guard.blocked) {
    console.warn(
      `[DB] 이 기기 DB 는 스키마 v${guard.seen} — 이 번들(v${SCHEMA_VERSION})은 옛 버전이라 열지 않는다(새로고침 필요)`,
    );
    return new LokiJSAdapter({
      schema: mySchema,
      migrations,
      useWebWorker: false,
      useIncrementalIndexedDB: true,
      dbName: GUARD_DB_NAME,
      extraLokiOptions: { autosave: false },
      onSetUpError: (error: Error) => {
        console.error('[DB] LokiJS(가드용 빈 DB) setup failed', error);
      },
    });
  }
  return new LokiJSAdapter({
    schema: mySchema,
    migrations,
    useWebWorker: false,
    useIncrementalIndexedDB: true,
    dbName: DB_NAME,
    // 다중 탭 덮어쓰기 거부 + 쓰기 문(lokijs 패치 옵션 · 참조 그대로 증분 IDB 어댑터까지 간다). 가드용 빈 DB 에는 걸지 않는다. @plm SRS-089
    // 주의: useWebWorker 를 true 로 바꾸면 옵션이 structured clone 을 거치며 함수(isSealed·onForeignWrite)가 빠져 안전망이 꺼진다(/qa code P4 L-7).
    extraIncrementalIDBOptions: lokiGateOptions(),
    onSetUpError: (error: Error) => {
      console.error('[DB] LokiJS setup failed', error);
    },
  });
}
