// 운동 블록 e2e 공용 헬퍼 — 화면 정리(SRS-069) 뒤 블록의 부가 행동(운동 방법·다른 조합·이전기록 지우기)은
// 「더 보기」 접기 안에 있다. 접기 상태는 기기에 기억되므로(전역 하나) 이미 펼쳐져 있으면 그대로 둔다.
import { expect } from "@playwright/test";

type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;

/** 블록의 「더 보기」를 펼친다(이미 펼쳐져 있으면 그대로). `scope` 를 주면 그 블록 안에서. */
export async function 블록_더보기(page: Page, scope?: Locator): Promise<void> {
  const root = scope ?? page;
  const toggle = root.getByTestId("block-more").first();
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}
