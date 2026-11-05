# 사진 자동 검사(SPEC-031) — 모델은 빌드 때 받아 해시로 확인한다. 실행 중에는 밖으로 나가지 않는다.
FROM python:3.12-slim
LABEL project=liftgram
# 평가에 쓴 버전과 같다. onnxruntime 1.20 은 이 모델의 ConvInteger 를 실행하지 못해 시작하자마자 죽는다.
RUN pip install --no-cache-dir onnxruntime==1.31.1 pillow==13.0.0 numpy==2.5.4
WORKDIR /app
ADD --checksum=sha256:bdc941491cd09ae75c5f40b038a5cd64482fa4e2b5297747323c5cda31303920 \
  https://huggingface.co/onnx-community/nsfw_image_detection-ONNX/resolve/1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5/onnx/model_int8.onnx \
  /app/model.onnx
COPY server.py /app/server.py
RUN chmod 444 /app/model.onnx /app/server.py && useradd -r -u 10001 app
USER app
# numpy 의 OpenBLAS 는 코어 수(서버 64개)만큼 스레드를 띄워 pids_limit 를 다 쓴다 — 그러면 상태 확인조차 실행되지 않는다.
ENV PYTHONDONTWRITEBYTECODE=1 HOME=/tmp OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
EXPOSE 8080
CMD ["python", "/app/server.py"]
