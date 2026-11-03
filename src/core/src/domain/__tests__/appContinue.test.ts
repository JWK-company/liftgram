// [원본] import { describe, expect, test } from "bun:test"; — make verify 는 node:test 로 돈다
import { describe, expect, test } from "./expectShim";
import { appLinkKind, isChallenge, maskEmail, shouldExchange } from "../appContinue";

describe("SPEC-018 §7 로그인 넘기기 규칙", () => {
  test("challenge 형식", () => {
    expect(isChallenge("a".repeat(43))).toBe(true);
    expect(isChallenge("A_-9".repeat(10) + "abc")).toBe(true);
    for (const bad of ["", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}+`, null, undefined]) {
      expect(isChallenge(bad)).toBe(false);
    }
  });

  test("앱 링크 갈래", () => {
    expect(appLinkKind("liftgram://auth?code=x")).toBe("auth");
    expect(appLinkKind("liftgram://workout")).toBe("workout");
    expect(appLinkKind("liftgram://start")).toBe("start");
    expect(appLinkKind("liftgram://start/")).toBe("start");
    expect(appLinkKind("LIFTGRAM://Auth?code=1")).toBe("auth");
    for (const bad of ["liftgram://authx", "liftgram://other", "https://liftgram.tarae.org/auth", "liftgramx://auth", "", null]) {
      expect(appLinkKind(bad)).toBeNull();
    }
  });

  test("주소 가리기", () => {
    expect(maskEmail("alice@gmail.com")).toBe("a••••@gmail.com");
    expect(maskEmail("ab@x.io")).toBe("a•••@x.io");
    expect(maskEmail("averyveryverylongname@x.io")).toBe("a••••••@x.io");
    expect(maskEmail("")).toBe("");
    expect(maskEmail("no-at")).toBe("");
    expect(maskEmail("@x.io")).toBe("");
    expect(maskEmail("a@")).toBe("");
    expect(maskEmail(null)).toBe("");
  });

  test("넘기기 착지는 세션 있는 앱에서 버린다", () => {
    expect(shouldExchange("continue", true)).toBe(false);
    expect(shouldExchange("continue", false)).toBe(true);
    expect(shouldExchange("google", true)).toBe(true);
    expect(shouldExchange("", true)).toBe(true);
  });
});
