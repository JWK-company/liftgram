// @plm SRS-019  사진 업로드 — 보내기 전에 줄이고, binary로 나른다
//
// ─────────────────────────────────────────────────────────────────────────────
// ── 왜 브라우저에서 줄이나 ──────────────────────────────────────────────────
// 요즘 폰 사진은 한 장에 4~8MB다. 그대로 올리면 느리고, 저장 비용이 들고, 화면에서는
// 어차피 폭 600px 남짓으로 줄여 그린다. app도 같은 이유로 `quality: 0.7`로 받는다
// (expo-image-picker) — 여기서는 브라우저의 canvas로 같은 일을 한다.
//
// ── 왜 binary 전송인가 ──────────────────────────────────────────────────────
// Connect의 기본 JSON은 bytes를 base64로 싣는다 — 33%가 그냥 붙는다.
// 사진 클라이언트만 binary로 만든다(나머지 화면은 JSON 그대로 — 디버깅이 쉽다).
//
// ── 무엇을 돌려주나 ─────────────────────────────────────────────────────────
// 서버가 준 **상대경로**(`/media/file/<key>`)를 그대로. 화면은 이 값을 글에 싣고,
// `<img src>`에는 `/api`를 붙여 쓴다(브라우저는 frontend만 보기 때문이다).
// ─────────────────────────────────────────────────────────────────────────────
import { MediaService, routes } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { authInterceptor } from "./session";

/** 사진 한 장의 긴 변 상한. 이보다 크면 비율을 지키며 줄인다. */
const MAX_EDGE = 1600;
/** JPEG 품질 — app의 expo-image-picker `quality: 0.7`과 같은 값. */
const QUALITY = 0.7;

function mediaClient(): Client<typeof MediaService> {
  return createClient(
    MediaService,
    createConnectTransport({
      baseUrl: routes.apiPrefix,
      // 사진은 그대로 나른다 — JSON이면 base64로 33%가 붙는다.
      useBinaryFormat: true,
      interceptors: [authInterceptor()],
    }),
  );
}

/**
 * 사진을 올리고 **글에 실을 주소**를 돌려준다.
 *
 * 줄이기에 실패하면(오래된 브라우저·이상한 파일) 원본을 그대로 보낸다 —
 * 최적화를 못 했다고 업로드 자체를 막을 이유는 없다. 크기 상한은 서버가 지킨다.
 */
export async function uploadImage(file: File): Promise<string> {
  const shrunk = await shrink(file).catch(() => null);
  const blob = shrunk ?? file;
  const data = new Uint8Array(await blob.arrayBuffer());
  const res = await mediaClient().uploadImage({ data, contentType: blob.type || file.type });
  return res.media?.url ?? "";
}

/** 서버가 준 상대경로를 `<img src>`가 쓸 주소로. 절대주소(CDN)면 그대로 둔다. */
export function mediaSrc(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return `${routes.apiPrefix}${url}`;
}

/**
 * 긴 변이 MAX_EDGE를 넘으면 줄인다. 넘지 않으면 **손대지 않는다** —
 * 다시 그리면 png가 jpeg로 바뀌고 화질만 잃는다.
 */
async function shrink(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= MAX_EDGE) return null;

    const scale = MAX_EDGE / longEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // 투명도가 있는 그림(png)은 jpeg로 바꾸면 배경이 검게 뭉갠다 — 그런 파일은 png로 남긴다.
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), type, QUALITY);
    });
  } finally {
    bitmap.close();
  }
}
