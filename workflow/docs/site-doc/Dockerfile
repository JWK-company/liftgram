FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
ARG OURO_BASE_URL=https://ouro.jungmin.kim
RUN sed -i "s|https://ouro.jungmin.kim|${OURO_BASE_URL}|g" pages/index.mdx pages/getting-started/installation.mdx || true
ENV API_KEYS=""
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
