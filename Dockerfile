FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm ci --no-audit --no-fund --cache /tmp/.npm \
  && npm run build \
  && rm -rf \
    node_modules \
    .next/cache \
    .next/standalone/node_modules/sharp \
    .next/standalone/node_modules/@img \
    /root/.npm \
    /tmp/*

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nextjs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
