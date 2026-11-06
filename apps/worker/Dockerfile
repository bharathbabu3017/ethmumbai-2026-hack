# Build from the repo root: docker build -f apps/worker/Dockerfile .
FROM node:24-slim

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker apps/worker
COPY packages packages
RUN pnpm install --frozen-lockfile --filter "@flashmob/worker..."

WORKDIR /app/apps/worker
# Node runs directly, not through pnpm, so it receives SIGTERM and can finish running jobs.
CMD ["node", "--import", "tsx", "src/index.ts"]
