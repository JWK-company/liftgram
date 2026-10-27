// 테스트 전용 node 로더 — 저장소(data/*Repository)를 node 에서 실제 WatermelonDB(LokiJS 메모리)로 돌린다(CD-4).
//
// 막히는 것 둘(메모리 「WatermelonDB 이관 node 검증」):
//   1) tsx(esbuild)는 `@field('x') declare foo` 의 데코레이터를 못 읽는다 → models/*.ts 만 `declare` 를 떼고
//      experimentalDecorators·useDefineForClassFields=false 로 직접 변환한다(앱 tsconfig 와 같은 설정).
//   2) db/database.ts 는 IndexedDB 어댑터를 연다 → 같은 폴더의 memoryDatabase.ts(LokiMemoryAdapter)로 바꿔 끼운다.
// 다른 파일은 그대로 tsx 가 맡는다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// esbuild 는 tsx 의 의존성이다(최상위에 올라와 있지 않다) — tsx 옆에서 찾는다.
const req = createRequire(import.meta.url);
const { transformSync } = createRequire(req.resolve('tsx'))('esbuild');

const MEMORY_DB = new URL('./memoryDatabase.ts', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const r = await nextResolve(specifier, context);
  if (/\/core\/src\/db\/database\.ts$/.test(r.url) && !context.parentURL?.endsWith('/memoryDatabase.ts'))
    return { ...r, url: MEMORY_DB, shortCircuit: true };
  return r;
}

export async function load(url, context, nextLoad) {
  if (/\/core\/src\/db\/models\/[^/]+\.ts$/.test(url)) {
    const src = readFileSync(fileURLToPath(url), 'utf8').replace(/(@\w+(?:\([^)]*\))?\s+)+declare\s+/g, (m) =>
      m.replace(/declare\s+$/, ''),
    );
    const out = transformSync(src, {
      loader: 'ts',
      format: 'esm',
      sourcefile: fileURLToPath(url),
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } },
    });
    return { format: 'module', source: out.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
