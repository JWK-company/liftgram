// 운영 웹 설정(SPEC-033) — 앱과 따로 빌드되고 계약(@app/contracts)만 함께 쓴다.
// CSP 는 요청마다 nonce 가 필요해 proxy.ts 가 붙인다. 나머지 고정 헤더는 여기 한 곳이다.
import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@app/contracts"],
  // 워크스페이스 밖(contracts)의 파일이 standalone 에 실리도록 저장소 루트를 기준점으로 둔다.
  outputFileTracingRoot: path.join(import.meta.dirname, "../"),
  poweredByHeader: false,
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
