// 운동 화면 피드백(2026-10-28) e2e
//   ① 헤더(경과 시간·일시정지·완료)는 스크롤해도 화면 위에 붙어 있다 — 마지막 종목까지 내려가도 완료를 누를 수 있다
//   ② 블록 도구 줄의 순서 버튼(⌃⌄)은 맨 왼쪽이고 서로 붙어 있다 — 오른쪽 끝의 ⌄ 가 「메모 펼치기」로 읽히던 혼동
import { expect, test } from "@playwright/test";
import { 블록, 빠른_운동_시작, 안내_띠_닫기, 종목_추가, 카탈로그_준비 } from "./fixtures/declutter-seed";

test("헤더는 맨 아래까지 스크롤해도 보이고, 순서 버튼은 도구 줄 맨 왼쪽에 붙어 있다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  for (const n of ["바벨 벤치프레스", "케이블 푸시다운", "덤벨 플라이", "바벨 스쿼트"])
    await 종목_추가(page, n);
  await 안내_띠_닫기(page);

  // ① 맨 아래로 — 헤더의 경과 시간·완료가 화면 맨 위에 그대로 있다
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY), "실제로 스크롤됐다").toBeGreaterThan(200);
  for (const id of ["session-header", "elapsed", "btn-pause", "btn-complete"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box?.y ?? -1, `${id} 위치`).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? 999, `${id} 위치`).toBeLessThan(80);
  }
  // 헤더가 내용 위에 그려진다(아래 블록이 헤더를 덮지 않는다) — 완료를 실제로 누를 수 있다
  await page.getByTestId("btn-complete").click();
  await expect(page.getByTestId("dialog-confirm")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "취소" }).last().click();

  // ② 도구 줄: ⌃⌄ 가 휴식·메모보다 왼쪽 · 두 버튼 사이가 붙어 있다
  const card = 블록(page, 1);
  const up = await card.getByTestId("btn-move-up").boundingBox();
  const down = await card.getByTestId("btn-move-down").boundingBox();
  const rest = await card.getByTestId("btn-rest-setting").boundingBox();
  const note = await card.getByTestId("btn-note-open").boundingBox();
  expect(up && down && rest && note, "도구 줄 버튼").toBeTruthy();
  if (!up || !down || !rest || !note) return;
  expect(up.x, "⌃ 가 휴식보다 왼쪽").toBeLessThan(rest.x);
  expect(down.x + down.width, "⌄ 가 휴식보다 왼쪽").toBeLessThanOrEqual(rest.x);
  expect(rest.x, "휴식이 메모보다 왼쪽").toBeLessThan(note.x);
  expect(down.x - (up.x + up.width), "⌃⌄ 사이 간격").toBeLessThanOrEqual(1);
  expect(down.x - up.x, "아이콘 중심 사이").toBeLessThanOrEqual(40);
});
