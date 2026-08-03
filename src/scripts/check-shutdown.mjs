// SIGTERM 정상 종료 — 실시간 연결이 1001(going away)로 닫히는가
import WebSocket from "ws";
const base = process.argv[2],
  pid = Number(process.argv[3]);
const ws = new WebSocket(`${base.replace(/^http/, "ws")}/ws`);
let closeCode = null;
await new Promise((r) => ws.on("open", r));
ws.send(JSON.stringify({ type: "subscribe", name: "default" }));
await new Promise((r) => setTimeout(r, 400));
ws.on("close", (c) => {
  closeCode = c;
});
const t0 = Date.now();
process.kill(pid, "SIGTERM");
await new Promise((r) => setTimeout(r, 2500));
let alive = true;
try {
  process.kill(pid, 0);
} catch {
  alive = false;
}
console.log(`   WS 종료 코드=${closeCode} (기대 1001) · 프로세스 종료=${!alive} · 소요 ${Date.now() - t0}ms`);
process.exit(closeCode === 1001 && !alive ? 0 : 1);
