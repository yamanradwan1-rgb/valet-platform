FROM node:24-bookworm-slim

RUN npm install --global pnpm@10.34.5
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Both Next artifacts have immutable, same-namespace loopback API rewrites.
ENV API_ORIGIN=http://127.0.0.1:3001
RUN pnpm --filter @valet/contracts build \
 && pnpm --filter @valet/ui build \
 && pnpm --filter @valet/api build \
 && pnpm --filter @valet/customer build \
 && pnpm --filter @valet/dashboard build
RUN chown -R node:node /app/apps/customer/.next /app/apps/dashboard/.next

USER node
CMD ["node", "deploy/issue310/entrypoint.mjs"]
