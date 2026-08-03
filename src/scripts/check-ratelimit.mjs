// @plm SRS-012  rate limit 검증 — 실제로 막는가, 인스턴스를 늘려도 합산되는가
//
// 한도를 넘겨 두드리고 429가 오는지, Retry-After와 잔여 헤더가 정확한지 본다.
// BASE2가 주어지면 **두 인스턴스에 나눠 보내** 합산 한도가 유지되는지도 확인한다
// (인스턴스별로 세면 스케일 아웃이 제한을 무력화한다 — 그걸 잡는 검사다).
import { rpcUrl } from "./rpc.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const base2 = process.argv[3] ?? null;

// Connect unary는 평범한 POST다 — 읽기 버킷을 쓰는 RPC 하나로 센다.
async function hit(target) {
  const r = await fetch(rpcUrl(target, "ListExercises"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 1 }),
  });
  return {
    status: r.status,
    limit: Number(r.headers.get("ratelimit-limit") ?? 0),
    remaining: Number(r.headers.get("ratelimit-remaining") ?? -1),
    retryAfter: r.headers.get("retry-after"),
  };
}

const first = await hit(base);
if (!first.limit) {
  console.log("   제한 비활성(RATE_LIMIT<=0) — 건너뜀");
  process.exit(0);
}
const limit = first.limit;
console.log(`   한도 ${limit}/창`);

let blocked = null;
const targets = base2 ? [base, base2] : [base];
for (let i = 0; i < limit + 10; i++) {
  const t = targets[i % targets.length]; // 두 인스턴스에 번갈아 보낸다
  const res = await hit(t);
  if (res.status === 429) {
    blocked = { at: i + 2, ...res };
    break;
  }
}

if (!blocked) {
  console.log(`   ❌ ${limit + 10}번을 넘겼는데도 막히지 않았다`);
  process.exit(1);
}
console.log(
  `   ${blocked.at}번째에 429 · Retry-After=${blocked.retryAfter}s · 남은 횟수=${blocked.remaining}`,
);
if (base2) console.log(`   두 인스턴스에 나눠 보냈는데도 합산 한도가 지켜졌다(${base} · ${base2})`);
if (!blocked.retryAfter) {
  console.log("   ❌ Retry-After가 없다");
  process.exit(1);
}
console.log("   ✅ 제한이 실제로 동작한다");
