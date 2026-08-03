// @plm SRS-008  web 설정 — 읽는 곳은 여기 하나
//
// api와 달리 web은 DB를 모른다. 필요한 것은 "api가 어디 있는가"와 표시용 값뿐이다.
// 값 접근 시점에 검증한다 — 모듈 최상단에서 읽으면 `next build`가 런타임 설정을 요구하게 된다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// .env를 찾아 읽는다 — 다만 **이미 설정된 값은 덮지 않는다**.
// 그래서 우선순위가 항상 이렇게 된다:  실제 환경변수 > .env 파일 > 스키마 기본값.
//
// 위로 거슬러 올라가며 찾는 이유: 모노레포에서 설정 파일은 **저장소 루트에 하나**뿐인데
// 실행 위치는 워크스페이스 안(backend·frontend)이다. 찾지 못해도 조용히 넘어간다 —
// 컨테이너·CI에는 .env가 없고 환경변수만 오기 때문이다(누락은 아래 스키마 검증이 잡는다).
//
// 파서를 직접 둔 이유: `process.loadEnvFile`은 Node에만 있고 Bun에는 없다(실측).
// 개발은 bun, 컨테이너는 node로 도는 이 프로젝트에서 런타임에 따라 설정이 달리 읽히면
// "내 컴퓨터에선 되는데"가 생긴다 — 그래서 읽는 방법을 한 가지로 고정한다.
function loadDotenv() {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
      for (const raw of readFileSync(file, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        if (process.env[key] !== undefined) continue; // 이미 설정된 값이 이긴다
        // 따옴표로 감싼 값은 벗긴다(공백이 들어간 값을 적을 수 있게).
        process.env[key] = line
          .slice(eq + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadDotenv();

const schema = z.object({
  /** 내부 api 주소. 컨테이너에서는 서비스 이름(http://api:3001). */
  API_URL: z.string().url().default("http://127.0.0.1:3001"),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10000),
  INSTANCE_ID: z.string().optional(),
  /**
   * 프로덕션인가. 세션 쿠키에 `Secure`를 붙일지 정하는 데 쓴다 —
   * 로컬은 http라 붙이면 쿠키가 아예 저장되지 않는다.
   */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});
export type WebEnv = z.infer<typeof schema>;

let cached: WebEnv | null = null;
function load(): WebEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ");
    throw new Error(`[env] web 설정 검증 실패 — ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** 부팅 시 명시적으로 검증을 강제한다(server.mjs가 부른다). */
export function assertEnv(): WebEnv {
  return load();
}

export const env = new Proxy({} as WebEnv, {
  get: (_t, key: string) => (load() as Record<string, unknown>)[key],
});
