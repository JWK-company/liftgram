// 화면 정리 전후 캡처(사람이 보는 비교용) — 평소 e2e 에서는 건너뛴다.
// 실행: DECLUTTER_SHOTS=<저장 폴더> BASE=… npx playwright test e2e/declutter-shots.spec.ts
import { test } from "@playwright/test";
import { 붐비는_운동_화면, 지난_기록_채우기, 카탈로그_준비 } from "./fixtures/declutter-seed";

const OUT = process.env.DECLUTTER_SHOTS;

test.use({ deviceScaleFactor: 2 });

test("운동 블록 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(300_000);
  const shots: { name: string; w: number; h: number; scheme: "light" | "dark" }[] = [
    { name: "block-390-light", w: 390, h: 844, scheme: "light" },
    { name: "block-390-dark", w: 390, h: 844, scheme: "dark" },
    { name: "block-360x640", w: 360, h: 640, scheme: "light" },
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.emulateMedia({ colorScheme: s.scheme });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
  }
});
