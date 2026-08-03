// @plm SRS-008  web의 커스텀 서버가 쓰는 의존의 closure를 계산한다.
//
// 왜 필요한가: Next의 파일 트레이싱은 **앱 코드만** 따라간다. `frontend/server.mjs`는 빌드 밖의
// entry point이라 그 의존이 standalone 출력에 실리지 않는다 — Dockerfile이 명시적으로 복사해야 하고,
// 목록이 어긋나면 컨테이너가 부팅에서 바로 실패한다.
//
// api에는 이 문제가 없다(워크스페이스 단위 프로덕션 설치를 통째로 싣는다) — 그래서 여기 없다.
//
// 사용: node scripts/runtime-deps.mjs   → 출력 목록이 Dockerfile의 web 이미지 COPY와 일치해야 한다
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const seen = new Set();
async function walk(pkg) {
  if (seen.has(pkg)) return;
  // 워크스페이스 루트에 호이스팅되거나 web 워크스페이스 안에 설치될 수 있다 — 둘 다 본다.
  const p = ["node_modules", "frontend/node_modules"]
    .map((base) => `${base}/${pkg}/package.json`)
    .find((f) => existsSync(f));
  if (!p) return;
  seen.add(pkg);
  const deps = JSON.parse(await readFile(p, "utf8")).dependencies ?? {};
  for (const d of Object.keys(deps)) await walk(d);
}

// server.mjs가 직접 import 하는 것 + 그것이 끌고 오는 것.
// (next·react는 standalone이 이미 싣는다 — 여기 넣지 않는다)
for (const root of ["ws", "zod"]) await walk(root);
console.log([...seen].sort().join("\n"));
