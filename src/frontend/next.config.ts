// @plm SRS-049  컨테이너 runtime contract — standalone 출력으로 런타임 이미지 최소화
// @plm SRS-049  기본 보안 헤더는 프레임워크 설정에서 한 번에 건다
import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // e2e 빌드 깃발(SRS-082 P5-6) — 빌드 때 브라우저 번들에 상수로 박는다. 운영 빌드는 빈 값이라 시험용 실패 주입이 죽은 코드가 된다(lib/e2eFlags).
  env: { NEXT_PUBLIC_E2E_FAULTS: process.env.NEXT_PUBLIC_E2E_FAULTS === "1" ? "1" : "" },
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

  // 옛 운영 주소는 운영 웹으로 넘긴다(SPEC-033). 목적지는 빌드 값이다. 값이 없으면 넘기지 않고 404 로 둔다.
  async redirects() {
    const admin = (process.env.ADMIN_URL ?? "").replace(/\/$/, "");
    if (!admin) return [];
    return (
      [
        ["/admin/stats", "/stats"],
        ["/admin/feedback", "/user-feedback"],
        ["/admin", "/"],
        ["/staff", "/"],
        ["/feedback", "/ops-feedback"],
        ["/moderation", "/moderation"],
        ["/ops", "/ops"],
      ] as const
    ).map(([source, to]) => ({ source, destination: `${admin}${to}`, permanent: false }));
  },

  // 모든 응답에 붙는 최소 보안 헤더.
  // 프로젝트에 맞춰 CSP·HSTS를 여기서 더하면 된다 — HSTS는 HTTPS로 서비스할 때만 켠다.
  // CSP 를 넣으면 영상 받아 적기(SPEC-054 Phase 4)에 frame-src https://www.youtube-nocookie.com ·
  // script-src https://www.youtube.com https://s.ytimg.com(IFrame API) 가 필요하다.
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
      // SPEC-018 §7  넘기기 확인 화면 — 남의 페이지에 끼워 넣어 「계속」을 누르게 하지 못하게(frame-ancestors) ·
      // 주소의 ac 가 리퍼러·캐시로 새지 않게.
      {
        source: "/app/continue",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // 서비스워커는 브라우저가 매번 새 버전을 확인해야 한다 — 캐시되면 배포가 기기에 닿지 않는다.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // SPEC-034 운동 영상·썸네일 — 파일 이름에 해시가 있어 같은 이름은 늘 같은 바이트다.
      {
        source: "/motion/:name([0-9A-Za-z_.-]+\\.(?:mp4|webp))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // SPEC-018 안드로이드 APK 자체 배포 — 파일 이름에 버전·해시가 있어(liftgram-<이름>-<코드>-<sha8>.apk) 같은 이름은 늘 같은 바이트다
      // → 1년 immutable(운영 H-1). 브라우저가 화면으로 열지 않고 받게 attachment(운영 L-2).
      {
        // [원본] source: "/downloads/:name(liftgram-.+\\.apk)" — 이름에 아무 글자나 허용돼 Content-Disposition 에 따옴표·세미콜론이 실릴 수 있었다(REV-013 보안 L-4)
        // [개선] 빌드 스크립트가 만드는 모양만(liftgram-<버전>-<코드>-<sha8>.apk)
        source: "/downloads/:name(liftgram-[0-9A-Za-z.]+-[0-9]+-[0-9a-f]+\\.apk)",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          // 이름을 붙여야 일부 다운로더가 엉뚱한 이름(「download」 등)으로 저장하지 않는다(Phase 1 qa 웹 L-3)
          { key: "Content-Disposition", value: 'attachment; filename=":name"' },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // 최신 버전 안내는 늘 새로 — 엣지·브라우저가 옛 json 을 잡고 있으면 업데이트가 안 보인다.
      {
        source: "/downloads/android.json",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      // 쿠폰 화면 — 브라우저·엣지가 담지 않고, 바깥 링크로 수상 id 가 새지 않게(SPEC-063 · REV-155 보안 4)
      {
        source: "/awards/:id",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default config;
