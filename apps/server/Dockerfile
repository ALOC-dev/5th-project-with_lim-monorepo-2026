# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @monorepo/server build

# Playwright 이미지가 Chromium 실행에 필요한 OS 의존성을 이미 포함하고 있어
# apps/server/package.json 의 playwright 버전(1.60.0)과 태그를 맞춘다.
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
