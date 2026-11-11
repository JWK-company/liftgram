// 운동 블록 e2e 공용 헬퍼.
// [원본] 화면 정리(SRS-069) 뒤 블록의 부가 행동(운동 방법·다른 조합·이전기록 지우기)은 「더 보기」 접기 안에 있었다 — 블록_더보기() 가 펼쳤다.
// [개선 SPEC-057] 「더 보기」를 걷어 부가 행동은 늘 보인다 — 펼칠 것 없이 그 블록 안에 보이는지만 본다.
// 대상 블록을 꼭 넘긴다: 「어느 블록의 무엇」인지 테스트에 드러나야 엉뚱한 블록을 잡지 않는다(/qa code L-7).
import { expect } from "@playwright/test";

type Locator = import("@playwright/test").Locator;

// [원본] 그 블록의 「더 보기」를 펼친다(이미 펼쳐져 있으면 그대로) — 펼친 내용이 그 블록 안에 보이는지까지 본다.
// export async function 블록_더보기(block: Locator): Promise<void> {
//   const toggle = block.getByTestId("block-more");
//   await expect(toggle).toBeVisible({ timeout: 15_000 });
//   if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
//   await expect(toggle).toHaveAttribute("aria-expanded", "true");
//   await expect(block.getByTestId("block-more-panel")).toBeVisible();
// }

/** 그 블록의 부가 행동 줄(운동 방법 ▾ 또는 다른 조합·이전기록 숨기기)이 보일 때까지 기다린다. */
export async function 블록_행동_보임(block: Locator): Promise<void> {
  await expect(block.getByTestId("tip-toggle").or(block.getByTestId("block-actions")).first()).toBeVisible({
    timeout: 15_000,
  });
}
