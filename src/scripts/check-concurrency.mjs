// 동시성 검증 — 같은 idempotency key로 한꺼번에 두드려도 종목은 하나만 생긴다
//
// 왜 이걸 보나: 재시도는 순차로만 오지 않는다. 네트워크가 흔들리면 **같은 요청이 겹쳐서** 도착하고,
// 그때 idempotency 기록이 경합에 지면 같은 종목이 둘 생긴다(이름 unique 제약이 있으니 대개는
// 한쪽이 conflict로 떨어지는데, 그 실패를 사용자에게 보여 주는 것 자체가 결함이다).
//
// 기대: 20개 동시 요청 → 성공 응답이 전부 같은 id를 가리키고, 카탈로그는 정확히 1종만 늘어난다.
import { cleanup, probeName, rpc } from "./rpc.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const N = 20;

const count = async () => {
  // 개정 번호가 카탈로그 크기를 한 줄로 알려 준다(목록을 다 읽지 않아도 된다).
  const r = await rpc(base, "ListExercises", { limit: 1, query: probe });
  return r.json?.items?.length ?? 0;
};

const probe = probeName("conc");
const body = {
  nameKo: probe,
  primaryMuscles: ["MUSCLE_BICEPS"],
  equipment: "EQUIPMENT_DUMBBELL",
  idempotencyKey: `conc-${Date.now()}`,
};

const results = await Promise.all(Array.from({ length: N }, () => rpc(base, "CreateCustomExercise", body)));

const ids = new Set(results.filter((r) => r.status === 200).map((r) => r.json?.exercise?.id));
const failed = results.filter((r) => r.status !== 200);
const rows = await count();

const id = [...ids][0] ?? "";
await cleanup(base, id);

console.log(
  `   동시 ${N}건 · 성공 ${N - failed.length} · 서로 다른 id ${ids.size}개 · 카탈로그 증가 ${rows}종`,
);

if (ids.size !== 1 || rows !== 1) {
  console.log(`   ❌ 같은 키의 동시 요청이 하나로 모이지 않았다`);
  process.exit(1);
}
if (failed.length > 0) {
  // 하나로 모이긴 했지만 일부가 오류를 받았다 — 사용자에게는 실패로 보인다.
  // 왜 실패했는지가 중요하다: 요청 제한(429)이면 검사 환경 문제이고,
  // already_exists면 idempotency 기록이 경합에 진 **진짜 결함**이다.
  const why = failed.map((r) => `${r.status}/${r.json?.code ?? "?"}`).join(", ");
  console.log(`   ❌ ${failed.length}건이 오류를 받았다 — ${why}`);
  console.log(
    `      (429면 한도를 올려 다시 보세요: RATE_LIMIT=0 · already_exists면 idempotency 경합입니다)`,
  );
  process.exit(1);
}
console.log("   ✅ 동시 재전송이 정확히 하나로 모인다");
