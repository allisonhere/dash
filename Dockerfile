# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# --- runtime stage ---
FROM node:22-alpine
# Links the ghcr package to the repo so it inherits access settings.
LABEL org.opencontainers.image.source="https://github.com/allisonhere/dash"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DASH_CONFIG_DIR=/config

# docker-cli: monitor the host's containers via the mounted socket (homelab
# page, "local" docker host). procps: real uptime/free for the host vitals line.
RUN apk add --no-cache docker-cli procps

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

VOLUME /config
EXPOSE 3000
CMD ["node", "build"]
