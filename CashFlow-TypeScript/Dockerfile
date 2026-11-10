FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN npm run build && npm prune --omit=dev
FROM node:24-alpine
WORKDIR /app
ENV HOST=0.0.0.0 PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY --from=build /app/public ./public
COPY database ./database
USER node
EXPOSE 3001
CMD ["node", "dist/container.js"]
