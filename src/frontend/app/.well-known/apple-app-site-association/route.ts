// @plm SRS-095 [ADR-046]  iOS 유니버설 링크 검증 — 이 도메인의 링크(피드 공유 등)를 설치된 앱이 열어도 된다는 증명
// IOS_APP_ID(「팀ID.번들ID」)가 없으면 404. 애플은 리디렉트 없이 HTTPS·JSON 으로 받아야 한다(확장자 없는 경로).
// 앱이 열 경로: 공유 링크(피드 글·프로필·해시태그)만. 로그인 복귀는 이 링크가 아니라 앱 스킴 liftgram:// 로 한다(qa spec H-6).
// 북타래 같은 파일을 옮겼다.
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const appId = env.IOS_APP_ID.trim();
  if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appId)) return new Response("Not Found", { status: 404 });
  const body = {
    applinks: {
      details: [
        {
          appIDs: [appId],
          // 공유 링크 경로만(안드로이드 intent-filter 와 같은 목록 · qa code M-2)
          // [원본] [{ "/": "/feed/*" }, { "/": "/u/*" }, { "/": "/hashtag/*" }] · [개선] 그룹 챌린지(SPEC-064)
          components: [{ "/": "/feed/*" }, { "/": "/u/*" }, { "/": "/hashtag/*" }, { "/": "/challenges/*" }],
        },
      ],
    },
    webcredentials: { apps: [appId] },
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
