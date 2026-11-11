// SPEC-059(#T19) 코칭 정리 — 줄 ⋯ 를 떼고 🗑 하나 · 회원 쪽은 코치 이름 → 시트 · 연결 이력은 회원 화면 루틴 탭 맨 아래.
//   1) 🗑 이름이 상태마다 다르다: 보낸 요청 「요청 취소」 · 받은 요청 「요청 거절」 · 코칭 중 「연결 끊기」
//      확인창 제목도 같은 뜻 · 「운동 기록은 지워지지 않아요」
//   2) 회원 — 코치 이름을 누르면 시트(공유 범위 바꾸기 · 연결 이력) · 줄에 ⋯ 없음
//   3) 코치 — 회원 화면 루틴 탭 맨 아래 「연결 이력」을 펼치면(그때 한 번만 읽음) 요청·수락이 보인다
import { expect, test } from "@playwright/test";
import { 내_id, 코치_시트, 프로필로_요청 } from "./helpers/coaching";
import { 가입, 새_기기, 새_메일 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;

async function 코칭요청_받기_켜기(page: Page) {
  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await page.keyboard.press("Escape");
}

test("코칭 정리 — 🗑 이름·확인창 · 코치 이름 시트 · 회원 화면 연결 이력", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  const 코치 = `정리코치${tag}`;
  const 회원 = `정리회원${tag}`;

  const [ctxT, pageT] = await 새_기기(browser);
  try {
    await 가입(pageT, 새_메일("tidy-t"), 코치);
    await 코칭요청_받기_켜기(pageT);
    const 코치id = await 내_id(pageT);

    await 가입(page, 새_메일("tidy-m"), 회원);
    await 프로필로_요청(page, 코치id);

    // 1) 보낸 요청 — 🗑 「요청 취소」 · 확인창은 취소 문구 · 닫으면 그대로
    await page.goto("/coaching");
    const mrow = page.getByTestId("coaching-coaches").getByTestId("coaching-grant").filter({ hasText: 코치 });
    await expect(mrow).toContainText("수락 대기", { timeout: 20_000 });
    // ⋯ 가 다른 이름으로 되살아나도 잡히게 — 대기 줄의 버튼은 🗑 하나뿐(REV-144 B4)
    await expect(mrow.getByRole("button")).toHaveCount(1);
    const mtrash = mrow.getByTestId("coaching-revoke");
    await expect(mtrash).toHaveAttribute("aria-label", `${코치} 요청 취소`);
    await expect(mtrash).toHaveAttribute("aria-haspopup", "dialog");
    await mtrash.click();
    const dlg = page.getByTestId("coaching-revoke-confirm");
    await expect(dlg).toContainText(`${코치}님에게 보낸 요청을 취소할까요?`);
    await expect(dlg).toContainText("운동 기록은 지워지지 않아요");
    await dlg.getByTestId("dialog-cancel").click();
    await expect(mrow).toContainText("수락 대기");
    // 수락 전에는 이름이 시트를 열지 않는다
    await expect(mrow.getByTestId("coaching-coach-open")).toHaveCount(0);

    // 받은 요청 — 🗑 「요청 거절」 · 회원 화면으로 들어가지 않는다
    await pageT.goto("/coaching");
    const trow = pageT
      .getByTestId("coaching-members")
      .getByTestId("coaching-grant")
      .filter({ hasText: 회원 });
    await expect(trow).toContainText("수락 대기", { timeout: 20_000 });
    await expect(trow.getByTestId("coaching-revoke")).toHaveAttribute("aria-label", `${회원} 요청 거절`);
    await trow.getByTestId("coaching-revoke").click();
    await expect(pageT.getByTestId("coaching-revoke-confirm")).toContainText(
      `${회원}님의 요청을 거절할까요?`,
    );
    await pageT.getByTestId("coaching-revoke-confirm").getByTestId("dialog-cancel").click();
    await expect(trow.getByTestId("coaching-member-open")).toHaveCount(0);
    await trow.getByTestId("coaching-accept").click();
    await expect(trow).toContainText("코칭 중", { timeout: 20_000 });
    await expect(trow.getByTestId("coaching-revoke")).toHaveAttribute("aria-label", `${회원} 연결 끊기`);
    // 코칭 중 코치 쪽 줄 — 회원 화면 링크 + 🗑 (버튼은 🗑 하나)
    await expect(trow.getByRole("button")).toHaveCount(1);
    await expect(trow.getByRole("link")).toHaveCount(1);

    // 2) 회원 — 코칭 중 🗑 「연결 끊기」 · 코치 이름 → 시트(범위·이력)
    await page.reload();
    await expect(mrow).toContainText("코칭 중", { timeout: 20_000 });
    await expect(mtrash).toHaveAttribute("aria-label", `${코치} 연결 끊기`);
    // 코칭 중 회원 쪽 줄 — 이름 버튼 + 🗑 둘뿐
    await expect(mrow.getByRole("button")).toHaveCount(2);
    await 코치_시트(page, "coaching-coaches", 코치);
    const sheet = page.getByTestId("coaching-coach-sheet");
    await expect(sheet.getByTestId("coaching-scope")).toBeVisible();
    await expect(sheet.getByTestId("coaching-history-link")).toBeVisible();
    await sheet.getByTestId("coaching-history-link").click();
    await expect(page.getByTestId("coaching-history")).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Escape");

    // 3) 코치 — 회원 화면 루틴 탭 맨 아래 「연결 이력」(접힘 → 펼치면 읽음)
    await trow.getByTestId("coaching-member-open").click();
    await expect(pageT).toHaveURL(/\/coaching\/m\//, { timeout: 20_000 });
    await pageT.getByTestId("member-tab-routines").click();
    const hist = pageT.getByTestId("member-history");
    await expect(hist).toBeVisible({ timeout: 20_000 });
    // 펼치기 전엔 읽지 않는다 — 줄 수가 아니라 ListAudit 요청 수로(응답 전 0줄은 늘 참 · REV-144 B3)
    let audits = 0;
    pageT.on("request", (r) => {
      if (r.url().includes("/coaching.v1.CoachingService/ListAudit")) audits++;
    });
    await pageT.waitForTimeout(500);
    expect(audits).toBe(0);
    await pageT.getByTestId("member-history-toggle").click();
    await expect(pageT.getByTestId("member-history-line").first()).toBeVisible({ timeout: 20_000 });
    expect(audits).toBe(1);
    expect(await pageT.getByTestId("member-history-line").count()).toBeGreaterThanOrEqual(2);
    await expect(hist).toContainText("코칭 요청");
    await expect(hist).toContainText("수락");
    // 접었다 펼쳐도 다시 묻지 않는다
    await pageT.getByTestId("member-history-toggle").click();
    await pageT.getByTestId("member-history-toggle").click();
    await expect(pageT.getByTestId("member-history-line").first()).toBeVisible();
    expect(audits).toBe(1);
  } finally {
    await ctxT.close();
  }
});

test("8칸 코드 — 소문자는 대문자로 · 칸 넘김 · 붙여넣기(하이픈) · Backspace · 8자에서만 확인 · 틀린 코드는 알림 · 360px", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await 가입(page, 새_메일("tidy-code"), `코드칸${Date.now().toString(36)}`);
  await page.goto("/coaching");
  const input = page.getByTestId("coaching-code-input");
  const boxes = page.getByTestId("coaching-code-box");
  const check = page.getByTestId("coaching-code-check");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await expect(boxes).toHaveCount(8);
  // [원본] autocomplete one-time-code — SMS 인증번호를 제안해 엉뚱한 값이 들어간다(REV-145 A5)
  await expect(input).toHaveAttribute("autocomplete", "off");
  await expect(input).toHaveAttribute("aria-label", "초대 코드 8자리");
  await expect(page.getByPlaceholder("표시 이름으로 검색")).toHaveCount(0); // 코치 찾기 검색은 없다(코드 칸이 보인 뒤)
  await expect(page.getByTestId("coaching-find-hint")).toBeVisible();
  await expect(page.getByTestId("coaching-find-people")).toHaveAttribute("href", "/people");

  // 칸을 누르면 입력칸에 초점 · 소문자를 한 글자씩 치면 대문자로 칸이 차례로 찬다
  await boxes.nth(3).click({ force: true }); // 칸 그림 위엔 투명한 입력칸이 덮여 있다 — 그 자리를 누른다
  await expect(input).toBeFocused();
  await page.keyboard.type("ab12");
  await expect(input).toHaveValue("AB12");
  await expect(boxes.nth(0)).toHaveText("A");
  await expect(boxes.nth(3)).toHaveText("2");
  await expect(boxes.nth(4)).toHaveAttribute("data-filled", "0");
  await expect(check).toBeDisabled();
  // Backspace 는 앞 칸을 비운다
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("AB1");
  await expect(boxes.nth(2)).toHaveText("1");
  await expect(boxes.nth(3)).toHaveText("");
  // 영문·숫자가 아닌 글자는 버리고 안내 — 글자마다 따로 잰다(REV-145 B2)
  const hint = page.getByTestId("coaching-code-hint");
  await page.keyboard.type("한");
  await expect(input).toHaveValue("AB1");
  await expect(hint).toHaveText("영문·숫자로 입력해 주세요");
  await page.keyboard.press("Backspace"); // 안내 지우기용으로 하나 지웠다 다시
  await page.keyboard.type("1");
  await expect(hint).toHaveText("");
  await page.keyboard.type("!");
  await expect(hint).toHaveText("영문·숫자로 입력해 주세요");
  await expect(input).toHaveValue("AB1");
  // 실제 IME 조합(CDP) — 조합 중 한글은 기다리고, 끝나면 버린다
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "ㅎ", selectionStart: 1, selectionEnd: 1 });
  await expect(boxes.nth(3)).toHaveText("");
  await cdp.send("Input.insertText", { text: "한" });
  await expect(input).toHaveValue("AB1");
  // 8자가 되면 「확인」이 켜진다 · 8자를 넘으면 자른다 · 저절로 확인하지 않는다
  let asked = 0;
  page.on("request", (r) => {
    if (r.url().includes("/coaching.v1.CoachingService/GetInvite")) asked++;
  });
  await input.press("Enter"); // 3자에서 Enter 는 묻지 않는다(REV-145 B5)
  await page.waitForTimeout(300);
  expect(asked).toBe(0);
  await page.keyboard.type("2cd34xyz");
  await expect(input).toHaveValue("AB12CD34");
  await expect(boxes.nth(7)).toHaveText("4");
  await expect(check).toBeEnabled();
  await page.waitForTimeout(1_500);
  expect(asked).toBe(0);

  // 붙여넣기 — 하이픈·소문자·공백 섞여도 같은 8자
  await input.fill("");
  await expect(check).toBeDisabled();
  // 붙여넣기·SMS 자동완성처럼 한 번에 여러 글자가 들어오는 경로
  await page.keyboard.insertText(" zz9z-zz9z ");
  await expect(input).toHaveValue("ZZ9ZZZ9Z");
  await expect(boxes.nth(4)).toHaveText("Z");
  // 공유 문구·링크를 통째로 붙여도 코드만(REV-145 A2)
  await input.fill("");
  await page.keyboard.insertText("liftgram 에서 코칭 연결하기 — 코드 QW12-ER34");
  await expect(input).toHaveValue("QW12ER34");
  await expect(page.getByTestId("coaching-code-hint")).toHaveText(""); // 깔끔히 맞으면 안내 없음
  await input.fill("");
  await page.keyboard.insertText("https://liftgram.tarae.org/coaching/join?code=as12-df34");
  await expect(input).toHaveValue("AS12DF34");
  // 값이 있을 때 앞 칸을 눌러도 커서는 끝 — 중간에 끼워지지 않는다(REV-145 A4)
  await input.fill("");
  await page.keyboard.insertText("zz9z");
  await boxes.nth(0).click({ force: true });
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(4);
  await page.keyboard.type("q");
  await expect(input).toHaveValue("ZZ9ZQ");
  await page.keyboard.press("Backspace"); // 지우기도 끝에서
  await expect(input).toHaveValue("ZZ9Z");
  // 글자가 있는 칸에 8자 넘게 붙여도 8자에서 자른다
  await page.keyboard.insertText("ab12cd34ef");
  await expect(input).toHaveValue("ZZ9ZAB12");
  // 안드로이드 키보드처럼 영문을 조합으로 보내도 칸이 바로 찬다(REV-145 A1)
  await input.fill("");
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="coaching-code-input"]');
    el?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  });
  await page.keyboard.insertText("ab");
  await expect(input).toHaveValue("AB");
  await expect(boxes.nth(1)).toHaveText("B");
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="coaching-code-input"]');
    el?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "ab" }));
  });
  await input.fill("");
  await page.keyboard.insertText(" zz9z-zz9z ");
  await expect(input).toHaveValue("ZZ9ZZZ9Z");

  // 틀린 코드 — Enter 로 확인 · 오류는 role=alert · 입력칸이 오류를 가리킨다
  await input.press("Enter");
  const err = page.getByTestId("coaching-code-error");
  await expect(err).toBeVisible({ timeout: 20_000 });
  expect(asked).toBe(1); // 오류는 서버 응답에서(REV-145 B5)
  await expect(err).toHaveAttribute("role", "alert");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  const errId = await err.getAttribute("id");
  expect((await input.getAttribute("aria-describedby")) ?? "").toContain(errId ?? "#");
  // 고치기 시작하면 오류가 사라진다
  await page.keyboard.press("Backspace");
  await expect(err).toHaveCount(0);

  // 360px — 칸 줄이 넘치지 않고 칸 높이 48px · 확인 버튼은 전체 너비
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(360);
  const b0 = await boxes.first().boundingBox();
  expect(b0 && Math.round(b0.height)).toBe(48);
  const cb = await check.boundingBox();
  const row = await page.getByTestId("coaching-code-boxes").boundingBox();
  expect(cb && row && Math.abs(cb.width - row.width) <= 1).toBe(true);
});
