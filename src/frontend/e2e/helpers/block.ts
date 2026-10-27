// 운동 블록 e2e 공용 헬퍼 — 화면 정리(SRS-069) 뒤 블록의 부가 행동(운동 방법·다른 조합·이전기록 지우기)은
// 「더 보기」 접기 안에 있다. 접기는 블록 전체가 하나(이번 운동 동안 기억) — 그 사실은 declutter-block.spec 이 따로 잰다.
// 대상 블록을 꼭 넘긴다: 「어느 블록의 무엇」인지 테스트에 드러나야 접기 범위가 바뀌어도 엉뚱한 블록을 잡지 않는다(/qa code L-7).
import { expect } from "@playwright/test";

type Locator = import("@playwright/test").Locator;

/** 그 블록의 「더 보기」를 펼친다(이미 펼쳐져 있으면 그대로) — 펼친 내용이 **그 블록 안에** 보이는지까지 본다. */
export async function 블록_더보기(block: Locator): Promise<void> {
  const toggle = block.getByTestId("block-more");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(block.getByTestId("block-more-panel")).toBeVisible();
}
