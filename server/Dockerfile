FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8787
# Mount a persistent volume here: upload URLs are written into the contract and never change.
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8787
CMD ["node", "dist/index.js"]
