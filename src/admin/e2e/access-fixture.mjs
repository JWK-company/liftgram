// 시험용 Cloudflare Access 흉내 — 서명 키(/certs)와 토큰 발급(/token)만 한다.
// 운영 빌드의 진짜 검증 코드를 그대로 지나게 하려고 검증을 끄지 않고 키 주소만 이쪽으로 돌린다(CF_ACCESS_CERTS_URL).
import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
// 실행마다 새 키다. 떠 있는 서버의 키 캐시가 옛 키로 맞추지 않도록 kid 도 바꾼다.
const kid = `e2e-${Date.now()}`;
const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/certs") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({ keys: [jwk] }));
  }
  if (url.pathname === "/token") {
    const key = url.searchParams.get("key") === "other" ? other.privateKey : privateKey;
    const hs256 = url.searchParams.has("hs256");
    const jwt = new SignJWT({ email: "e2e@example.com" })
      .setProtectedHeader({ alg: hs256 ? "HS256" : "RS256", kid })
      .setIssuer(url.searchParams.get("iss") ?? "https://e2e.cloudflareaccess.com")
      .setAudience(url.searchParams.get("aud") ?? "e2e-aud");
    if (!url.searchParams.has("noexp")) jwt.setExpirationTime(Number(url.searchParams.get("exp")) || "2h");
    const token = await jwt.sign(
      hs256 ? new TextEncoder().encode("e2e-shared-secret-0123456789abcdef") : key,
    );
    return res.end(token);
  }
  res.statusCode = 404;
  res.end();
}).listen(3322, "127.0.0.1");
