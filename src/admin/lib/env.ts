// 운영 웹 설정 — 읽는 곳은 여기 하나다(SPEC-033). 모듈 최상단에서 검증하지 않아 `next build` 에 값이 필요 없다.
import { z } from "zod";

const schema = z.object({
  /** 내부 백엔드 주소. 컨테이너에서는 서비스 이름. */
  API_URL: z.string().url().default("http://127.0.0.1:3001"),
  /** 운영 웹의 공개 주소. 세션 라우트가 Origin 을 이 값과 정확히 맞춘다. */
  ADMIN_URL: z.string().url().default("http://localhost:3102"),
  /** 사용자 앱 주소. 비밀번호 만들기 안내와 미리 보기 링크에 쓴다. */
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** 이 포트에 닿는 것이 cloudflared 뿐일 때만 1. 그때만 CF-Connecting-IP 를 클라이언트 주소로 믿는다. */
  TRUST_CF_CONNECTING_IP: z.string().default("0"),
  /** Cloudflare Access 애플리케이션의 aud 값. 운영에서 비면 모든 요청을 거절한다. */
  CF_ACCESS_AUD: z.string().default(""),
  /** Cloudflare Access 팀 주소(예: example.cloudflareaccess.com). 운영에서 비면 모든 요청을 거절한다. */
  CF_ACCESS_TEAM_DOMAIN: z.string().default(""),
  /** 서명 키 주소. 시험에서만 바꾼다. 비면 팀 주소의 표준 경로를 쓴다. */
  CF_ACCESS_CERTS_URL: z.string().default(""),
});

export type AdminEnv = z.infer<typeof schema>;

export function env(): AdminEnv {
  return schema.parse(process.env);
}

export function adminOrigin(): string {
  return new URL(env().ADMIN_URL).origin;
}
