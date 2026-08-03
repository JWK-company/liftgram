// @plm SRS-009  e2e 설정 — 이미 떠 있는 앱을 대상으로 돈다(테스트가 서버를 띄우지 않는다)
//
// 왜 webServer를 쓰지 않나: 이 템플릿은 "컨테이너로 띄운 것과 같은 것"을 확인하고 싶다.
// 테스트가 자기만의 개발 서버를 띄우면 프로덕션 이미지가 아니라 다른 것을 검사하게 된다.
// 그래서 make up-all(또는 make dev)로 띄운 뒤 make e2e 로 붙는다.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // 같은 카탈로그를 공유하므로 순차 실행한다(생성·보관이 서로를 흔들지 않게)
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.BASE ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure", // 실패했을 때만 추적 파일을 남긴다(용량·시간 절약)
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
