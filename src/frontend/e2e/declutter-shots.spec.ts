// 화면 정리 전후 캡처(사람이 보는 비교용) — 평소 e2e 에서는 건너뛴다.
// 실행: DECLUTTER_SHOTS=<저장 폴더> BASE=… npx playwright test e2e/declutter-shots.spec.ts
import { test } from "@playwright/test";
import {
  붐비는_운동_화면,
  안내_띠_닫기,
  요약_재료,
  지난_기록_채우기,
  카탈로그_준비,
} from "./fixtures/declutter-seed";

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

// P2 — 요약·기록 상세·분석. 화면 전체 길이로 찍는다(요약은 「끝까지」 가 얼마나 긴지가 비교 대상이다).
test("요약·기록 상세·분석 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(300_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const snap = async (name: string) => {
    await 안내_띠_닫기(page); // 로그인 안 한 기기에만 뜨는 띠 — 실제 사용자는 보지 않는다
    for (const s of shots) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.emulateMedia({ colorScheme: s.scheme });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-${s.tag}.png`, fullPage: true });
    }
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await page.waitForTimeout(800);
  await snap("summary");
  // 화면 단위 캡처 — 전체 길이 캡처는 sticky 「완료」 바가 부가 행동 줄을 덮는다(P2 /qa code L-7).
  // 첫 종목의 「PR n」 을 펼친 채 끝까지 내린 실제 뷰포트를 남긴다.
  await page.getByTestId("summary-row-pr").first().click();
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.emulateMedia({ colorScheme: s.scheme });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/summary-end-${s.tag}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("btn-summary-close").click();
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await page.getByTestId("detail-exercises").waitFor({ timeout: 20_000 });
  await snap("detail");
  await page.goto("/stats");
  await page.getByTestId("stat-volume").waitFor({ timeout: 20_000 });
  await snap("stats");
});
