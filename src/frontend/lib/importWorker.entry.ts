// @plm SRS-081  가져오기 Worker 진입점 — lib/importTask.ts 의 computeImportTask 를 메시지로 감싼다.
// 원본 내용은 로그로 남기지 않는다(오류도 코드만 돌려준다).
import { computeImportTask, ImportTaskError, type WorkerInbound, type WorkerOutbound } from "./importTask";

const post = (m: WorkerOutbound) =>
  (self as unknown as { postMessage: (m: WorkerOutbound) => void }).postMessage(m);

self.addEventListener("message", (ev: MessageEvent<WorkerInbound>) => {
  const { id, req } = ev.data ?? ({} as WorkerInbound);
  if (typeof id !== "number" || !req) return;
  try {
    const result = computeImportTask(req, (progress) => post({ id, type: "progress", progress }));
    post({ id, type: "done", result });
  } catch (e) {
    post({ id, type: "error", code: e instanceof ImportTaskError ? e.code : "failed" });
  }
});
