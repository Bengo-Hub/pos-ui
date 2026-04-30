FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN pnpm install --shamefully-hoist

FROM base AS builder
WORKDIR /app
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=https://posapi.codevertexitsolutions.com
ARG NEXT_PUBLIC_NOTIFICATIONS_URL=https://notifications.codevertexitsolutions.com
ARG NEXT_PUBLIC_TREASURY_API_URL=https://booksapi.codevertexitsolutions.com
ARG NEXT_PUBLIC_TREASURY_UI_URL=https://books.codevertexitsolutions.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_NOTIFICATIONS_URL=$NEXT_PUBLIC_NOTIFICATIONS_URL
ENV NEXT_PUBLIC_TREASURY_API_URL=$NEXT_PUBLIC_TREASURY_API_URL
ENV NEXT_PUBLIC_TREASURY_UI_URL=$NEXT_PUBLIC_TREASURY_UI_URL

RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir -p .next .next/static
RUN chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
