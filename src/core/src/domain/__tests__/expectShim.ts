// node:test 위의 작은 expect — bun:test 와 같은 모양으로 쓰되 `node --import tsx --test` 에서 돈다(SPEC-018 시험)
import assert from 'node:assert/strict';

export { describe, test } from 'node:test';

function matchObject(actual: unknown, expected: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(expected)) assert.deepEqual((actual as Record<string, unknown>)[k], v);
}

export function expect(actual: unknown) {
  const api = {
    toBe: (e: unknown) => assert.equal(actual, e),
    toEqual: (e: unknown) => assert.deepEqual(actual, e),
    toBeNull: () => assert.equal(actual, null),
    toContain: (e: unknown) => assert.ok((actual as unknown[] | string).includes(e as never), `${String(actual)} ∌ ${String(e)}`),
    toMatch: (re: RegExp) => assert.match(String(actual), re),
    toMatchObject: (e: Record<string, unknown>) => matchObject(actual, e),
    not: {
      toBe: (e: unknown) => assert.notEqual(actual, e),
      toContain: (e: unknown) => assert.ok(!(actual as unknown[] | string).includes(e as never), `${String(actual)} ∋ ${String(e)}`),
    },
  };
  return api;
}
