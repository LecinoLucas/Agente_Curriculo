# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1/public
ARG VITE_API_URL=http://localhost:8000/api/v1
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_ENABLE_DEV_CANDIDATE_LOGIN=false

ENV VITE_PUBLIC_API_BASE_URL=$VITE_PUBLIC_API_BASE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_ENABLE_DEV_CANDIDATE_LOGIN=$VITE_ENABLE_DEV_CANDIDATE_LOGIN

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS server

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
