// @plm SRS-095 [ADR-046]  Android 앱 링크 검증(Digital Asset Links) — 이 도메인의 링크를 설치된 앱이 직접 열어도 된다는 증명
// ANDROID_CERT_SHA256(플레이 콘솔 「앱 서명」 지문 · 여러 개면 쉼표)이 없으면 404. 북타래 같은 파일을 옮겼다.
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const prints = env.ANDROID_CERT_SHA256.split(",")
    .map((v) => v.trim().toUpperCase())
    .filter((v) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v));
  if (prints.length === 0) return new Response("Not Found", { status: 404 });
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.ANDROID_PACKAGE || "org.tarae.liftgram",
        sha256_cert_fingerprints: prints,
      },
    },
  ];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
