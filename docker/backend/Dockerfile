###############################################
# Stage 1 — Base
###############################################

FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

###############################################
# Stage 2 — Prune Workspace
###############################################

FROM base AS pruner

RUN apk add --no-cache libc6-compat

COPY . .

RUN pnpm dlx turbo prune backend --docker

###############################################
# Stage 3 — Install & Build
###############################################

FROM base AS builder

RUN apk add --no-cache libc6-compat

COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

RUN pnpm --filter @repo/db db:generate

RUN pnpm --filter backend build

###############################################
# Stage 4 — Runtime
###############################################

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S nodejs && \
    adduser -S express -G nodejs

COPY --from=builder /app .

USER express

EXPOSE 8000

CMD ["pnpm", "--filter", "backend", "start"]