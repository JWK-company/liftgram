// DB·브라우저 없이 도는 경계 시험(SPEC-033). bun run test:admin — make verify 에 들어간다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  AdminService,
  AuthService,
  FeedbackService,
  MediaService,
  ModerationService,
  OpsService,
} from "@app/contracts";
import { ALLOWED_RPCS, isAllowedRpc } from "./rpcAllow";
import { PAGE_SIZE, pageOf } from "./paging";
import { safeNext } from "./roles";
import { pct, weeklyRate } from "./statsCalc";
import { EVENT_LABELS } from "./statsLabels";
import {
  isStaffRole,
  readCookie,
  remainingSec,
  SESSION_MAX_SEC,
  sameOriginRequest,
  STARTED_COOKIE,
} from "./sessionCookie";

const ORIGIN = "https://admin.example";

test("safeNext: 같은 출처 경로만 받는다", () => {
  const cases: [string | null, string][] = [
    [null, "/"],
    ["/ops", "/ops"],
    ["/ops?x=1#y", "/ops?x=1#y"],
    ["//evil.example/x", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["/\n/evil.example", "/"],
    ["/\r/evil.example", "/"],
    ["https://evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["/login", "/"],
    ["/login?next=/x", "/"],
    ["/api/session", "/"],
    ["/healthz", "/"],
    ["/ops/../login", "/"],
    ["/loginx", "/loginx"],
  ];
  for (const [input, want] of cases) assert.equal(safeNext(input, ORIGIN), want, String(input));
});

test("허용 RPC 는 계약에 있는 것이고, 계약 전수 중 목록 밖은 모두 막힌다", () => {
  const services = [AuthService, AdminService, FeedbackService, MediaService, ModerationService, OpsService];
  const all = services.flatMap((s) => s.methods.map((m) => `/api/${s.typeName}/${m.name}`));
  for (const rpc of ALLOWED_RPCS) assert.ok(all.includes(rpc), `계약에 없는 허용 RPC: ${rpc}`);
  assert.equal(all.filter(isAllowedRpc).length, ALLOWED_RPCS.size);
  // 세션 라우트가 맡는 것과 앱 사용자 기능은 운영 프록시로 열리면 안 된다.
  for (const blocked of [
    "/api/auth.v1.AuthService/LogIn",
    "/api/auth.v1.AuthService/Refresh",
    "/api/auth.v1.AuthService/DeleteAccount",
    "/api/moderation.v1.ModerationService/Report",
    "/api/feedback.v1.FeedbackService/SubmitUserFeedback",
    "/api/ops.v1.OpsService/ReportClientHealth",
  ]) {
    assert.equal(isAllowedRpc(blocked), false, blocked);
  }
  assert.equal(isAllowedRpc("/api/ops.v1.OpsService%2FGetOpsAlert"), false);
  assert.equal(isAllowedRpc("/api/ops.v1.OpsService/GetOpsAlert%00"), false);
  assert.equal(isAllowedRpc("/api/auth.v1.AuthService/Me/"), false);
});

function req(headers: Record<string, string>): Request {
  return new Request("http://internal/x", { method: "POST", headers });
}

test("남은 세션 시간: 상한을 넘기지 못하고 미래·망가진 값은 0", () => {
  const now = 1_800_000_000_000;
  const at = (v: string | number) => req({ cookie: `${STARTED_COOKIE}=${v}` });
  assert.equal(remainingSec(at(now), now), SESSION_MAX_SEC);
  assert.equal(remainingSec(at(now - 3600_000), now), SESSION_MAX_SEC - 3600);
  assert.equal(remainingSec(at(now - (SESSION_MAX_SEC + 1) * 1000), now), 0);
  assert.equal(remainingSec(at(now + 10 * 365 * 86400_000), now), 0);
  assert.equal(remainingSec(at("abc"), now), 0);
  assert.equal(remainingSec(req({}), now), 0);
});

test("쿠키: 같은 이름이 둘이면 믿지 않는다", () => {
  assert.equal(readCookie(req({ cookie: "a=1; b=2" }), "b"), "2");
  assert.equal(readCookie(req({ cookie: "b=1; b=2" }), "b"), "");
  assert.equal(readCookie(req({ cookie: "bb=1" }), "b"), "");
});

test("세션 라우트 빗장: 세 조건이 모두 맞아야 한다", () => {
  process.env.ADMIN_URL = ORIGIN;
  const good = { "x-liftgram-admin-session": "1", origin: ORIGIN, "sec-fetch-site": "same-origin" };
  assert.equal(sameOriginRequest(req(good)), true);
  for (const k of Object.keys(good)) {
    const missing: Record<string, string> = { ...good };
    delete missing[k];
    assert.equal(sameOriginRequest(req(missing)), false, `${k} 없음`);
  }
  for (const bad of [
    { origin: "null" },
    { origin: `${ORIGIN}.evil.example` },
    { origin: "https://liftgram.tarae.org" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "none" },
    { "x-liftgram-admin-session": "0" },
  ]) {
    assert.equal(sameOriginRequest(req({ ...good, ...bad })), false, JSON.stringify(bad));
  }
});

test("운영진 역할: 정확한 문자열만", () => {
  for (const r of ["ROLE_MODERATOR", "ROLE_ADMIN"]) assert.equal(isStaffRole(r), true);
  for (const r of ["ROLE_USER", "ROLE_COWORKER", "", undefined, 4, "role_admin"])
    assert.equal(isStaffRole(r), false);
});

test("운영 웹 소스는 앱과 core 를 가져오지 않고 위험한 HTML 을 쓰지 않는다", () => {
  const root = path.join(import.meta.dirname, "..");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(deps["@app/core"], undefined);
  assert.equal(deps["@app/frontend"], undefined);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory())
        return ["node_modules", ".next", "test-results", "e2e"].includes(f) ? [] : walk(p);
      return /\.(ts|tsx|mjs)$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
    });
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/, file);
    for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*|require\()\s*["']([^"']+)["']/g)) {
      assert.doesNotMatch(m[1], /@app\/core|frontend\/|(^|\/)core\/src/, `${file}: ${m[1]}`);
    }
  }
});

test("서버가 받는 이벤트 이름마다 통계 이름표가 있다", () => {
  const go = readFileSync(path.join(import.meta.dirname, "../../backend/internal/usage/service.go"), "utf8");
  const block = /var allowedEvents = map\[string\]bool\{([\s\S]*?)\n\}/.exec(go)?.[1] ?? "";
  const names = [...block.matchAll(/"([a-z_]+)":\s*true/g)].map((m) => m[1]);
  assert.ok(names.length >= 30, `서버 이벤트를 읽지 못했다: ${names.length}`);
  assert.deepEqual(
    names.filter((n) => !Object.hasOwn(EVENT_LABELS, n)),
    [],
  );
  assert.deepEqual(
    Object.keys(EVENT_LABELS).filter((n) => !names.includes(n)),
    [],
  );
});

test("페이지: 망가진 번호는 1쪽, 범위 밖은 끝쪽", () => {
  const rows = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => i);
  for (const bad of [Number.NaN, 1.5, 0, -3]) {
    assert.equal(pageOf(rows, bad).page, 1, String(bad));
    assert.equal(pageOf(rows, bad).rows[0], 0);
  }
  assert.equal(pageOf(rows, 2).rows.length, 5);
  assert.equal(pageOf(rows, 9999).page, 2);
  assert.equal(pageOf([], 3).page, 1);
});

test("통계 계산: 비율과 주당 횟수의 시점 경계", () => {
  assert.equal(pct(1n, 4n), "25%");
  assert.equal(pct(0n, 0n), "—");
  const day = 86400_000;
  const since = 1_800_000_000_000;
  assert.equal(weeklyRate(40, 10, since, since + day), "4.0"); // 1주 미만은 1주로
  assert.equal(weeklyRate(40, 10, since, since + 14 * day), "2.0");
  assert.equal(weeklyRate(40, 10, since, since + 100 * day), "1.0"); // 4주 넘으면 4주로
  assert.equal(weeklyRate(5, 0, since, since + 100 * day), "1.3"); // 활동 인원 0 에도 나누기 오류 없음
});
