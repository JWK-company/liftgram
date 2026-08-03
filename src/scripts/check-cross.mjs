// 교차 인스턴스 propagation — B에 구독하고 A에서 바꾸면 B가 받아야 한다
//
// 왜 이걸 보나: 인스턴스가 하나뿐일 때는 메모리 버스로도 다 동작한다. 스케일 아웃한 순간
// **다른 인스턴스에 붙은 사용자만 화면이 안 바뀌는** 상태가 되는데, 이건 로컬에서 절대 안 보인다.
// (REALTIME_BUS=redis 여야 통과한다 — make scale-2가 그 조건으로 띄운다)
//
// 사용: node scripts/check-cross.mjs <A주소> <B주소>
import { cleanup, probeName, rpc, rpcUrl } from "./rpc.mjs";

const [a, b] = [process.argv[2], process.argv[3]];
if (!a || !b) {
  console.log("   두 인스턴스 주소가 필요합니다 — 건너뜀");
  process.exit(0);
}

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 8000);
let delta = false;
let probeId = "";

// 스트리밍 RPC는 요청 본문도 봉투로 감싼다(check-stream.mjs와 같은 이유).
function envelope(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(5 + json.length);
  new DataView(out.buffer).setUint32(1, json.length);
  out.set(json, 5);
  return out;
}

const res = await fetch(rpcUrl(b, "WatchCatalog"), {
  method: "POST",
  headers: { "content-type": "application/connect+json", "connect-protocol-version": "1" },
  body: envelope({}),
  signal: ctl.signal,
});

// 구독이 붙을 시간을 준 뒤 **다른 인스턴스(A)** 에서 카탈로그를 바꾼다.
(async () => {
  await new Promise((r) => setTimeout(r, 500));
  const r = await rpc(a, "CreateCustomExercise", {
    nameKo: probeName("cross"),
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
    while (buf.length >= 5) {
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const len = view.getUint32(1);
      if (buf.length < 5 + len) break;
      const payload = new TextDecoder().decode(buf.slice(5, 5 + len));
      buf = buf.slice(5 + len);
      if (payload.includes("KIND_DELTA")) delta = true;
    }
    if (delta) break;
  }
} catch {}
clearTimeout(timer);
ctl.abort();
await cleanup(a, probeId);

console.log(`   A(${a})에서 생성 → B(${b}) 수신: ${delta ? "도달" : "미도달"}`);
process.exit(delta ? 0 : 1);
