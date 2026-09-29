# -------------------------------------------------------------
# 1. Builder Stage
# -------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CI=true

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# -------------------------------------------------------------
# 2. Production Web Server (Nginx Alpine ~20MB image)
# -------------------------------------------------------------
FROM nginx:alpine AS runner

RUN sed -i 's/worker_connections.*/worker_connections 8192;/' /etc/nginx/nginx.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
