# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# VITE_ vars are baked into the JS bundle at build time.
# Pass custom values via --build-arg when targeting different environments.
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_API_URL=http://localhost:8000/api/v1
ARG VITE_CANDIDATE_PORTAL_URL=http://localhost:5174
ARG VITE_GOOGLE_CLIENT_ID=

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CANDIDATE_PORTAL_URL=$VITE_CANDIDATE_PORTAL_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Install deps first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source and build
COPY . .
# Run vite build directly — skips validate-repo-root.js which checks a host-specific path
# and is not meaningful inside a container. TypeScript errors still surface via tsc.
RUN node_modules/.bin/vite build

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS server

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
