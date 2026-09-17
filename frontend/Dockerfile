# Mini Plane 前端镜像（Sprint 8）—— 多阶段：deps → builder → runner
#
# 构建（在仓库根目录，由 docker-compose 负责）：
#     docker compose build frontend
# 直接构建也可以，但 **必须把 NEXT_PUBLIC_* 作为 build-arg 传进来**：
#     docker build -f frontend/Dockerfile \
#       --build-arg NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 \
#       --build-arg NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:8001 \
#       frontend
#
# 为什么 NEXT_PUBLIC_* 必须是 build-arg 而不是 runtime env：
# Next.js 在 **构建期** 就把它内联进客户端 bundle（公网可见的常量，不是密钥）。
# 容器起来后再设环境变量对已经打好的 bundle 毫无影响 —— 这是这个项目里最容易
# 误解的一处，所以在这里和 docker-compose.yml 里都写了。

# ── 1) deps：只装依赖，利用层缓存 ───────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# corepack 提供与 packageManager 字段一致的 pnpm，避免"本地 pnpm 11 / CI pnpm 9"这类漂移
RUN corepack enable

# 只复制清单文件：源码改动不会让依赖层失效
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ── 2) builder：构建 ────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建期常量（见文件头说明）。给默认值是刻意的：不传也能构建出一个
# "指向本地默认地址"的镜像，而不是构建失败。
ARG NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
ARG NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_WS_BASE=$NEXT_PUBLIC_WS_BASE
ENV NEXT_TELEMETRY_DISABLED=1

# next.config.ts 里 output: "standalone" → 产出 .next/standalone/server.js
RUN pnpm build

# ── 3) runner：只带运行期需要的东西 ─────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root 运行：镜像里没有 node 之外的任何东西，也就不该给 root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone 产物自带精简版 node_modules（只含被 server 引用的模块）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# 探活：/login 是唯一不依赖后端的公开页面，用它能区分"容器活着"和"后端没起"
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
