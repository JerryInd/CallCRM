# Build stage — same commands the repo already uses
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY server/package.json server/package-lock.json ./server/
RUN npm install --prefix frontend && npm install --prefix server
COPY frontend ./frontend
COPY server ./server
RUN npm run build:frontend && npm run build:server \
 && cd server && npm prune --omit=dev

# Runtime stage
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/callcrm.sqlite
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/frontend/dist ./frontend/dist
VOLUME /data
EXPOSE 3000
CMD ["node", "server/dist/server.js"]
