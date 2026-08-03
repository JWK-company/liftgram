// WebSocket 검증 — subscribe로 스냅샷, 종목을 만들면 델타
//
// 한 연결로 구독과 조작을 모두 한다는 것을 확인한다(그것이 WS를 쓰는 유일한 이유다).
// 검사가 만든 종목은 끝에서 치운다 — 카탈로그가 실행마다 불어나지 않게.
import WebSocket from "ws";
import { cleanup, probeName } from "./rpc.mjs";

const http = process.argv[2] ?? "http://127.0.0.1:3100";
const ws = new WebSocket(`${http.replace(/^http/, "ws")}/ws`);

let snapshot = false;
let delta = false;
let probeId = "";

const done = async (code) => {
  try {
    ws.close();
  } catch {}
  await cleanup(http, probeId);
  console.log(`   snapshot=${snapshot} delta=${delta}`);
  process.exit(code);
};

const t = setTimeout(() => void done(1), 8000);

ws.on("open", () => ws.send(JSON.stringify({ type: "subscribe" })));

ws.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === "snapshot") {
    snapshot = true;
    // 같은 소켓으로 조작을 보낸다 — 규칙은 RPC로 부를 때와 똑같이 service가 판정한다.
    ws.send(
      JSON.stringify({
        type: "createCustom",
        nameKo: probeName("ws"),
        primaryMuscles: ["biceps"],
        equipment: "dumbbell",
      }),
    );
  } else if (m.type === "created") {
    probeId = m.exercise?.id ?? "";
  } else if (m.type === "delta") {
    delta = true;
    clearTimeout(t);
    // 만든 것의 id가 아직 안 왔을 수 있다 — 잠깐 기다렸다가 치운다.
    setTimeout(() => void done(0), 100);
  } else if (m.type === "error") {
    clearTimeout(t);
    console.error(`   ws 오류: ${m.detail}`);
    void done(1);
  }
});

ws.on("error", () => void done(1));
