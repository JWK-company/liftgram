// 서버 스트리밍 검증 — 스냅샷 먼저, 카탈로그가 바뀌면 델타가 온다
//
// Connect 스트리밍은 **봉투(envelope) 프레임**으로 온다: 5바이트 머리(플래그 1 + 길이 4) + JSON.
// 라이브러리 없이 확인하려고 여기서 직접 푼다 — 검증 스크립트가 앱 의존을 끌어오지 않게 하기 위해서다.
// (화면은 @connectrpc/connect-web이 이 일을 대신한다)
import { cleanup, probeName, rpc, rpcUrl } from "./rpc.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 8000);

let snapshot = false;
let delta = false;
let probeId = "";

// 요청 본문도 **봉투로 감싸야 한다**(스트리밍 RPC는 양방향 모두 봉투 형식이다).
// 이걸 빠뜨리면 서버가 길이 머리를 본문으로 읽어 "promised N bytes" 오류를 낸다(실측).
function envelope(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(5 + json.length);
  new DataView(out.buffer).setUint32(1, json.length); // [0]=플래그 0, [1..4]=길이
  out.set(json, 5);
  return out;
}

const res = await fetch(rpcUrl(base, "WatchCatalog"), {
  method: "POST",
  headers: { "content-type": "application/connect+json", "connect-protocol-version": "1" },
  body: envelope({}),
  signal: ctl.signal,
});

// 스트림이 열린 뒤 카탈로그를 바꿔 델타를 유발한다.
// 이름은 실행마다 새로 짓는다 — unique 제약이 있어 고정 이름이면 두 번째 실행부터 실패한다.
(async () => {
  await new Promise((r) => setTimeout(r, 400));
  const r = await rpc(base, "CreateCustomExercise", {
    nameKo: probeName("stream"),
    primaryMuscles: ["MUSCLE_BICEPS"],
    equipment: "EQUIPMENT_DUMBBELL",
  });
  probeId = r.json?.exercise?.id ?? "";
})();

try {
  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const next = new Uint8Array(buf.length + value.length);
    next.set(buf);
    next.set(value, buf.length);
    buf = next;

    // 봉투를 있는 만큼 꺼낸다.
    while (buf.length >= 5) {
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const len = view.getUint32(1);
      if (buf.length < 5 + len) break;
      const payload = new TextDecoder().decode(buf.slice(5, 5 + len));
      buf = buf.slice(5 + len);
      if (payload.includes("KIND_SNAPSHOT")) snapshot = true;
      if (payload.includes("KIND_DELTA")) delta = true;
    }
    if (snapshot && delta) break;
  }
} catch {}
clearTimeout(timer);
ctl.abort();

// 검사가 만든 종목은 치운다 — 카탈로그가 실행마다 불어나지 않게.
await cleanup(base, probeId);

console.log(`   snapshot=${snapshot} delta=${delta}`);
process.exit(snapshot && delta ? 0 : 1);
