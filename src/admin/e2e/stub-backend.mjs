// 시험용 가짜 백엔드 — 운영 웹이 실제로 무엇을 넘기는지 받은 쪽에서 본다(SPEC-033 REV).
//   GET /__last            마지막 요청의 경로·헤더
//   POST /__next?status=N&message=M  다음 요청 하나의 상태 코드와 메시지
import { createServer } from "node:http";

let last = null;
let nextStatus = 0;
let nextMessage = "";

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__last") return res.end(JSON.stringify(last));
  if (url.pathname === "/__next") {
    nextStatus = Number(url.searchParams.get("status"));
    nextMessage = url.searchParams.get("message") ?? "";
    return res.end("ok");
  }
  req.resume();
  req.on("end", () => {
    last = { path: url.pathname, headers: req.headers };
    const status = nextStatus || 200;
    const message = nextMessage;
    nextStatus = 0;
    nextMessage = "";
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.setHeader("set-cookie", "evil=1; Path=/");
    res.setHeader("x-internal", "secret");
    res.end(status === 200 ? '{"online":{"total":1}}' : JSON.stringify({ code: "unavailable", message }));
  });
}).listen(3324, "127.0.0.1");
