#!/usr/bin/env node
// 앱 번들에 운영 RPC 이름이 들어가지 않았는가(SPEC-033). 빌드 뒤에 돌린다: node scripts/check-app-bundle.mjs
//
// 앱 프록시가 404 로 막아도, 화면 코드가 번들에 남으면 운영 기능이 사용자 기기까지 간다.
// Report·SubmitUserFeedback·ReportClientHealth 는 사용자 기능이라 목록에 없다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// 인자로 다른 .next 를 줄 수 있다(금지어를 넣은 사본으로 검사 자체를 시험할 때).
const NEXT = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "frontend", ".next");
const ROOT = join(NEXT, "static");
const OLD_ROUTES = ["admin", "staff", "feedback", "moderation", "ops"];
const FORBIDDEN = [
  // 운영 RPC 이름. 코드는 소문자로 시작하는 메서드 이름으로 부른다.
  "GetUsageStats",
  "getUsageStats",
  "GetFeatureStats",
  "getFeatureStats",
  "GetSignupStats",
  "getSignupStats",
  "GetRoutineStats",
  "getRoutineStats",
  "GetContentStats",
  "getContentStats",
  "GetOperationsStats",
  "getOperationsStats",
  "GetOpsStatus",
  "getOpsStatus",
  "GetOpsAlert",
  "getOpsAlert",
  "GetReviewMedia",
  "getReviewMedia",
  "ListQueue",
  "listQueue",
  "ListEntries",
  "listEntries",
  // 지운 화면의 흔적. 계약 설명자는 base64 로 들어가 RPC 이름만으로는 놓칠 수 있다.
  "admin-screen",
  "row-admin",
  "row-ops",
  "btn-moderation",
  "nav-staff",
  "mod-approve",
  "admin-feedback-list",
  "ops-error",
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".js")) yield p;
  }
}

let list;
try {
  list = [...files(ROOT)];
} catch {
  console.error(`  ✗ 빌드 결과가 없습니다: ${ROOT}`);
  process.exit(2);
}
if (list.length === 0) {
  console.error("  ✗ 검사할 JS 파일이 없습니다");
  process.exit(2);
}

let bad = 0;
// 클라이언트 코드 없는 서버 컴포넌트로 돌아와도 잡는다.
for (const route of OLD_ROUTES) {
  if (existsSync(join(NEXT, "server", "app", route))) {
    console.error(`  ✗ 옛 운영 경로가 다시 생겼습니다: /${route}`);
    bad += 1;
  }
}
for (const p of list) {
  const text = readFileSync(p, "utf8");
  for (const word of FORBIDDEN) {
    if (text.includes(word)) {
      console.error(`  ✗ ${relative(ROOT, p)}: ${word}`);
      bad += 1;
    }
  }
}
if (bad > 0) process.exit(1);
console.log(`  ✓ 앱 번들 ${list.length}개에 운영 RPC 가 없습니다`);
