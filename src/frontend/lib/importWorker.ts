// @plm SRS-081 SRS-082  가져오기 계산 일꾼 — 파싱·종목 맞추기·계획을 메인 스레드 밖(Worker)에서, 안 되면 메인에서 같은 함수로
//
// ─────────────────────────────────────────────────────────────────────────────
// 1만 세트 파일이면 파싱·해시·계획이 데스크톱 기준 ≈60ms, 폰(CPU 4~6×)에서는 수백 ms 가 된다. 그동안 화면이 굳지 않게
// 계산을 Worker 로 보낸다. DB 쓰기는 여기서 하지 않는다 — 웹 어댑터(LokiJS)는 메인 스레드에만 있다(importRepository).
//
// Worker 를 만드는 방법(스펙의 「blob Worker」와 다른 점): 계산 함수(core/domain/import)를 blob 문자열로 다시 싣으려면
// 같은 코드를 두 번 번들해야 한다. 대신 번들러가 Worker 전용 청크를 만드는 `new Worker(new URL(…), { type: "module" })` 를 쓴다.
// 그 청크는 /_next/static 아래라 서비스워커가 미리 받아 둔다(오프라인에서도 열린다 · build-sw.mjs).
// Worker 를 만들 수 없거나(옛 브라우저·보안 정책) 도중에 죽으면 **메인 스레드에서 같은 함수**를 부른다 — 결과는 같다.
//
// 원본 내용 로그 금지: 파일 본문·종목 이름·메모를 console 에 찍지 않는다. 오류도 코드(문자열 하나)로만 돌려준다.
// ─────────────────────────────────────────────────────────────────────────────
import { computeImportTask, ImportTaskError } from "./importTask";
import type {
  ImportTaskProgress,
  ImportTaskRequest,
  ImportTaskResult,
  WorkerInbound,
  WorkerOutbound,
} from "./importTask";

export * from "./importTask";

// ── 메인 쪽 실행기 ─────────────────────────────────────────────────────────
/** 마지막 계산이 어디서 돌았나(e2e·자가진단용 — 화면은 data-import-via 로 내보인다) */
export type ImportTaskVia = "worker" | "main";

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    // Turbopack 은 이 줄을 「부트스트랩 스크립트 + #params=<청크 목록>」 주소로 바꾼다. 그런데 서비스워커가 /_next/static 을
    // 캐시에서 내주면 Worker 의 location 에 그 #조각이 없어 부트스트랩이 「Missing worker bootstrap config」로 죽는다(실측 —
    // SW 를 막은 e2e 에서만 Worker 가 돌았다). 부트스트랩은 ?params= 도 읽으므로, 만드는 순간만 전역 Worker 를 감싸
    // #params 를 ?params 로 옮긴다. 쿼리가 붙은 주소는 캐시에 없어 네트워크로 받고(주소 보존), 오프라인이면 메인 대체로 간다.
    // [원본] worker = new Worker(new URL("./importWorker.entry.ts", import.meta.url), { type: "module", name: "liftgram-import" });
    const g = globalThis as unknown as { Worker: typeof Worker };
    const Native = g.Worker;
    g.Worker = class extends Native {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(paramsToQuery(url), opts);
      }
    };
    try {
      worker = new Worker(new URL("./importWorker.entry.ts", import.meta.url), { type: "module" });
    } finally {
      g.Worker = Native;
    }
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Turbopack Worker 주소의 `#params=…` 를 `?params=…` 로(부트스트랩은 둘 다 읽는다 · 서비스워커 캐시 응답은 #조각을 잃는다) */
export function paramsToQuery(u: string | URL): string | URL {
  try {
    const url = new URL(String(u), location.href);
    if (url.hash.startsWith("#params=") && !url.searchParams.has("params")) {
      url.searchParams.set("params", decodeURIComponent(url.hash.slice("#params=".length)));
      url.hash = "";
      return url.href;
    }
  } catch {
    // 주소를 못 읽으면 그대로
  }
  return u;
}

/** 메인 스레드 대체 — 한 번 양보해 진행 표시가 그려질 틈을 준다 */
async function runOnMain(
  req: ImportTaskRequest,
  onProgress: (p: ImportTaskProgress) => void,
): Promise<ImportTaskResult> {
  await new Promise((r) => setTimeout(r, 0));
  return computeImportTask(req, onProgress);
}

/** Worker 가 이만큼 아무 말이 없으면 죽은 것으로 보고 메인에서 다시 한다(첫 청크 받기 포함) */
const WORKER_SILENCE_MS = 15_000;
/** Worker 가 한 번이라도 말했으면(살아서 계산 중) 더 기다린다 — 저사양 폰에서 큰 파일 파싱 한 단계가 15초를 넘기면
 *  메인에서 같은 계산을 한 번 더 돌려 화면이 굳었다(P5-10). 파일 크기 상한(화면 · 30MB)과 함께 쓴다. */
const WORKER_BUSY_SILENCE_MS = 60_000;

/**
 * 계산을 돌린다 — Worker 먼저, 안 되면 메인. 계산 자체의 오류(unit_required 등)는 메인으로 다시 하지 않고 그대로 던진다.
 * @throws ImportTaskError
 */
export async function runImportTask(
  req: ImportTaskRequest,
  onProgress: (p: ImportTaskProgress) => void = () => {},
): Promise<{ result: ImportTaskResult; via: ImportTaskVia }> {
  const w = getWorker();
  if (!w) return { result: await runOnMain(req, onProgress), via: "main" };
  const id = ++seq;
  const viaWorker = await new Promise<ImportTaskResult | ImportTaskError | null>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heard = false;
    const arm = () => {
      if (timer) clearTimeout(timer);
      // [원본] timer = setTimeout(() => finish(null), WORKER_SILENCE_MS);
      timer = setTimeout(() => finish(null), heard ? WORKER_BUSY_SILENCE_MS : WORKER_SILENCE_MS);
    };
    const finish = (v: ImportTaskResult | ImportTaskError | null) => {
      if (timer) clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      w.removeEventListener("messageerror", onErr);
      resolve(v);
    };
    const onMsg = (ev: MessageEvent<WorkerOutbound>) => {
      const m = ev.data;
      if (!m || m.id !== id) return;
      heard = true;
      arm();
      if (m.type === "progress") onProgress(m.progress);
      else if (m.type === "done") finish(m.result);
      else finish(m.code === "failed" ? null : new ImportTaskError(m.code));
    };
    const onErr = () => finish(null);
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.addEventListener("messageerror", onErr);
    arm();
    try {
      w.postMessage({ id, req } satisfies WorkerInbound);
    } catch {
      finish(null);
    }
  });
  if (viaWorker instanceof ImportTaskError) throw viaWorker;
  if (viaWorker) return { result: viaWorker, via: "worker" };
  // Worker 가 죽었거나 말이 없다 — 버리고 메인에서 같은 계산
  try {
    w.terminate();
  } catch {
    // 이미 죽었다
  }
  worker = null;
  workerBroken = true;
  return { result: await runOnMain(req, onProgress), via: "main" };
}

/** 화면을 떠날 때 Worker 를 정리한다(다음에 들어오면 다시 만든다) */
export function disposeImportWorker(): void {
  try {
    worker?.terminate();
  } catch {
    // 무시
  }
  worker = null;
}
