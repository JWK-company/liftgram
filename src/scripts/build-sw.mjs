#!/usr/bin/env node
// @plm SRS-051  서비스워커 찍어내기 — `next build` 직후 정적 파일 목록·빌드 ID를 새겨 public/sw.js를 만든다
//
// 왜 빌드 때 찍는가: 배포마다 sw.js 내용이 바뀌어야 브라우저가 새 버전을 알아챈다. 빌드 ID와
// 미리 받을 파일 목록(해시가 들어간 이름)을 박으면 그 둘이 한 번에 해결된다.
// 라이브러리(Serwist 등)를 쓰지 않은 이유는 설계안 결정 1A — Next 16의 Turbopack 빌드와 무관하게 돈다.
//
//   node scripts/build-sw.mjs            # frontend/.next 를 읽어 frontend/public/sw.js 를 쓴다
//
// public/sw.js 는 생성물이라 커밋하지 않는다(.gitignore). 빌드가 없으면 실패한다 — 옛 목록을 박은
// 워커가 나가면 설치가 404로 깨진다.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../frontend/", import.meta.url));
const next = join(root, ".next");
const buildId = readFileSync(join(next, "BUILD_ID"), "utf8").trim();

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!name.endsWith(".map"))
      files.push(`/_next/static/${relative(join(next, "static"), p).split("\\").join("/")}`);
  }
})(join(next, "static"));

// 홈 화면 앱이 오프라인에서도 아이콘·이름을 갖게 한다.
const pub = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];
const precache = [...pub, ...files.sort()];

const template = readFileSync(join(root, "sw", "sw.template.js"), "utf8");
if (!template.includes("__BUILD_ID__") || !template.includes("__PRECACHE__")) {
  throw new Error("sw.template.js 에 자리표시자가 없다(__BUILD_ID__ · __PRECACHE__)");
}
const out = template.replace("__BUILD_ID__", buildId).replace("__PRECACHE__", JSON.stringify(precache));
writeFileSync(join(root, "public", "sw.js"), out);
console.log(`[build-sw] public/sw.js · build ${buildId} · 미리 받기 ${precache.length}개`);
