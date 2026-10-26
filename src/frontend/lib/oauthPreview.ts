// [임시-소셜설정전] 미리보기 소셜 제공자 — 서버 컴포넌트가 실행 시점 설정에서 읽어 화면에 넘긴다(이미지에 굽지 않는다).
import { env } from "./env";

export function previewProviders(): string[] {
  return env.OAUTH_PREVIEW_PROVIDERS.split(",")
    .map((p) => p.trim())
    .filter((p) => ["google", "kakao", "naver"].includes(p));
}
