# Multi-stage build — one container, one process, no build tools at runtime.
# node:22 required for node:sqlite (server uses DatabaseSync).
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package.json client/package-lock.json* ./client/
RUN npm ci --prefix client
COPY client ./client
RUN npm run build --prefix client

COPY server/package.json server/package-lock.json* ./server/
RUN npm ci --prefix server --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/client/dist ./client/dist
COPY server ./server
EXPOSE 5000
WORKDIR /app/server
CMD ["node", "index.js"]