// @plm SRS-008  컨테이너 runtime contract — standalone 출력으로 런타임 이미지 최소화
// @plm SRS-010  기본 보안 헤더는 프레임워크 설정에서 한 번에 건다
import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // 빌드 산출물을 .next/standalone 으로 — 런타임 이미지에 소스와 devDeps를 넣지 않는다.
  output: "standalone",

  // 워크스페이스 패키지는 **빌드하지 않는다**(ADR-011) — TS를 Next가 직접 트랜스파일한다.
  // 빌드 단계가 하나 줄고, "먼저 빌드해야 한다"는 순서 의존이 사라진다.
  //   @app/contracts  proto에서 생성된 계약
  //   @app/core       app/에서 이전해 온 도메인 계산·정적 데이터·문자열 (ADR-032)
  transpilePackages: ["@app/contracts", "@app/core"],

  // 모노레포에서는 추적 기준점을 **저장소 루트**로 명시한다(ADR-010).
  // 기본값은 이 앱 디렉터리라, 워크스페이스 밖(contracts·hoisted node_modules)의
  // 파일이 standalone에 실리지 않는다 — 컨테이너에서 "모듈을 찾을 수 없음"으로 나타난다.
  outputFileTracingRoot: path.join(import.meta.dirname, "../"),

  // 서버 종류를 광고할 이유가 없다(X-Powered-By: Next.js 제거).
  poweredByHeader: false,

  // **개발 모드 전용** — Next 16은 dev 리소스(`/_next/webpack-hmr` 등)에 origin 가드를 건다.
  // 우리 도구는 전부 127.0.0.1로 접속하는데(smoke·e2e의 BASE) dev 서버가 보는 origin과 달라서
  // HMR 소켓이 "Blocked cross-origin request"로 막히고, 그러면 **화면이 하이드레이션되지 않는다**
  // (버튼이 안 먹고 실시간 구독도 안 붙는다 — 실측으로 반나절 헤맨 자리다).
  // 프로덕션에는 영향이 없다.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // 모든 응답에 붙는 최소 보안 헤더.
  // 프로젝트에 맞춰 CSP·HSTS를 여기서 더하면 된다 — HSTS는 HTTPS로 서비스할 때만 켠다.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // 카메라·마이크는 쓰지 않으므로 닫아 둔다. **위치는 우리가 쓴다**(주변 헬스장 — SRS-035) —
          // `self`로 열어야 브라우저가 권한을 물어본다. 닫아 두면 사용자가 허용해도
          // "권한 정책으로 차단됨"이 되어, 화면은 권한 거부와 구분할 수 없다.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default config;
