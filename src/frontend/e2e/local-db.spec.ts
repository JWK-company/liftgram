// 로컬 저장소 계층 e2e — 이관해 온 WatermelonDB가 브라우저에서 실제로 왕복하는가
//
// 이 검사가 있는 이유: 실패가 **조용하다**. 번들러가 class-fields를 define 의미로 내보내면
// 데코레이터가 만든 접근자가 가려져 모델이 전부 undefined가 되는데, 타입 검사도 빌드도 통과한다.
// 화면만 "데이터가 없는 것처럼" 보인다. 그래서 사람이 아니라 기계가 매번 확인하게 둔다.
//
// 판정은 /diag/db 화면이 내린다(그 화면이 왕복을 실제로 수행한다) — 여기서는 결과만 읽는다.
import { expect, test } from "@playwright/test";

test("로컬 DB가 열리고 쓰기·읽기가 왕복한다", async ({ page }) => {
  await page.goto("/diag/db");

  const verdict = page.getByTestId("db-verdict");
  await expect(verdict).not.toHaveText("검사 중…", { timeout: 15_000 });

  // 실패했으면 어느 항목인지 그대로 보여 준다 — "실패"만으로는 원인을 못 찾는다.
  if ((await verdict.innerText()) !== "정상") {
    throw new Error(`로컬 DB 진단 실패:\n${await page.getByTestId("db-detail").innerText()}`);
  }

  const detail = await page.getByTestId("db-detail").innerText();
  for (const 항목 of [
    "DB 열림",
    "문자열 필드 왕복",
    "JSON 필드 왕복",
    "setter가 원시 행에 도달",
    "@readonly @date 접근자",
    "테이블",
    "진단 레코드 정리",
    // 배포·저장소 계층 — 여기까지 통과해야 "오프라인에서도 목록이 선다"고 말할 수 있다.
    "서버 배포 · repository",
    "개정 번호가 같으면 다시 받지 않는다",
    "디스크 flush 경로 살아 있음",
    "대체운동 해소",
  ]) {
    expect(detail).toContain(항목);
  }
});
