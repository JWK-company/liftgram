// [원본] import { describe, expect, test } from "bun:test"; — make verify 는 node:test 로 돈다
import { describe, expect, test } from "./expectShim";
import { appLinkKind, appWebLinkPath, isChallenge, maskEmail, shouldExchange } from "../appContinue";

describe("앱 링크 → 웹 경로(화면 지도 2026-11-09)", () => {
  const H = "liftgram.tarae.org";
  test("피드 글·프로필·해시태그만 경로로", () => {
    expect(appWebLinkPath("https://liftgram.tarae.org/feed/abc", H)).toBe("/feed/abc");
    expect(appWebLinkPath("https://liftgram.tarae.org/u/u1?x=1#c", H)).toBe("/u/u1?x=1#c");
    expect(appWebLinkPath("https://LIFTGRAM.tarae.org/hashtag/%EB%8B%A4", H)).toBe("/hashtag/%EB%8B%A4");
  });
  test("다른 주소·다른 경로·빈 경로·http·앱 스킴은 null", () => {
    for (const bad of [
      "https://evil.example/feed/abc",
      "https://liftgram.tarae.org.evil.example/feed/abc",
      "https://liftgram.tarae.org/api/auth/oauth/google/callback?code=1",
      "https://liftgram.tarae.org/feed/",
      "https://liftgram.tarae.org/feed",
      "https://liftgram.tarae.org/feedback/1",
      "http://liftgram.tarae.org/feed/abc",
      "liftgram://workout",
      "not a url",
      null,
      undefined,
    ]) {
      expect(appWebLinkPath(bad, H)).toBe(null);
    }
    expect(appWebLinkPath("https://liftgram.tarae.org/feed/abc", "")).toBe(null);
  });
});

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
