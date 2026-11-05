# 운영 웹 이미지(SPEC-033). 빌드 문맥은 src/ 다: docker build -f admin/Dockerfile .
#
# 앱 Dockerfile 과 나눈 까닭: 운영 서버에는 BuildKit(buildx)이 없다. 옛 빌더는 --target 앞의 단계를 전부 만들어서,
# 한 파일에 두면 운영 웹을 올릴 때마다 앱 전체를 다시 빌드한다. 공유 서버라 빌더를 바꾸지 않고 파일을 나눈다.

FROM oven/bun:1 AS deps
WORKDIR /app
# 워크스페이스 매니페스트가 모두 있어야 bun install 이 돈다.
COPY package.json bun.lock* ./
COPY frontend/package.json ./frontend/
COPY admin/package.json ./admin/
COPY contracts/package.json ./contracts/
COPY core/package.json ./core/
COPY patches ./patches
RUN bun install --frozen-lockfile

# 앱 소스를 복사하지 않는다. 앱만 바뀐 커밋은 이 아래 단계를 다시 만들지 않는다.
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/admin/node_modules ./admin/node_modules
COPY --from=deps /app/contracts/node_modules ./contracts/node_modules
COPY package.json tsconfig.json ./
COPY contracts ./contracts
COPY admin ./admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd admin build

FROM node:24-slim
LABEL project=liftgram
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /app/admin/.next/standalone ./
COPY --from=build /app/admin/.next/static ./admin/.next/static
USER app
WORKDIR /app/admin
EXPOSE 3000
CMD ["node", "server.js"]
