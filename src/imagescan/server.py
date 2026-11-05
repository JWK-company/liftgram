"""사진 자동 검사(SPEC-031) — 바이트를 받아 점수만 돌려준다. 사진을 저장하지 않고 밖으로 나가는 길도 없다."""
import io
import json
import os
import threading
import time
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFile, ImageOps

MAX_BYTES = 20 * 1024 * 1024
MAX_FRAMES = 5
# 호출하는 쪽 상한(3초)보다 짧게 — 끊긴 요청이 계산 자리를 잡고 있지 않게 한다.
DEADLINE_SEC = 2.5
SIZE = 224
ALLOWED = {"JPEG", "PNG", "WEBP", "GIF"}
MODEL = os.environ.get("MODEL_PATH", "/app/model.onnx")

# 압축 폭탄은 경고가 아니라 거절이다.
Image.MAX_IMAGE_PIXELS = 50_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
# 잘린 사진도 브라우저는 앞부분을 그린다. 거절하지 않고 보이는 만큼 검사한다.
ImageFile.LOAD_TRUNCATED_IMAGES = True

_opts = ort.SessionOptions()
_opts.intra_op_num_threads = 1
_opts.inter_op_num_threads = 1
_session = ort.InferenceSession(MODEL, _opts, providers=["CPUExecutionProvider"])
_input = _session.get_inputs()[0].name

# 동시에 2장만 계산하고, 대기가 차면 바로 503 — 호출하는 쪽이 3초 상한으로 기다리므로 줄을 길게 두지 않는다.
_running = threading.BoundedSemaphore(2)
_waiting = threading.BoundedSemaphore(8)


def _prep(frame: Image.Image) -> np.ndarray:
    rgb = ImageOps.exif_transpose(frame).convert("RGB").resize((SIZE, SIZE), Image.BILINEAR)
    arr = (np.asarray(rgb, dtype=np.float32) / 255 - 0.5) / 0.5
    return arr.transpose(2, 0, 1)[None]


def _score_frame(frame: Image.Image) -> float:
    logits = _session.run(None, {_input: _prep(frame)})[0][0]
    exp = np.exp(logits - logits.max())
    return float((exp / exp.sum())[1])


def score(data: bytes) -> float:
    img = Image.open(io.BytesIO(data))
    if img.format not in ALLOWED:
        raise ValueError("format")
    # 큰 JPEG 는 줄여서 읽는다(5천만 화소도 메모리를 거의 쓰지 않는다).
    img.draft("RGB", (SIZE * 2, SIZE * 2))
    deadline = time.monotonic() + DEADLINE_SEC
    frames = getattr(img, "n_frames", 1)
    # 움직이는 그림은 처음부터 끝까지 고르게 뽑은 프레임 중 가장 높은 점수를 쓴다.
    best = 0.0
    for i in sorted({n * frames // MAX_FRAMES for n in range(MAX_FRAMES)}):
        if time.monotonic() > deadline:
            raise TimeoutError("deadline")
        img.seek(i)
        best = max(best, _score_frame(img))
    return best


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, body=None):
        raw = json.dumps(body or {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self._reply(200 if self.path == "/healthz" else 404)

    def do_POST(self):
        if self.path != "/scan":
            return self._reply(404)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self._reply(413)
        # 자리를 먼저 잡고 읽는다 — 몰릴 때 본문을 메모리에 쌓지 않는다.
        if not _waiting.acquire(blocking=False):
            return self._reply(503)
        try:
            data = self.rfile.read(length)
            with _running:
                try:
                    return self._reply(200, {"score": score(data)})
                except Exception:
                    # 내용은 남기지 않는다 — 판단할 수 없는 사진은 호출하는 쪽이 사람 검토로 넘긴다.
                    return self._reply(400)
        finally:
            _waiting.release()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
