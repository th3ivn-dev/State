# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY package*.json ./
COPY assets/ ./assets/
ENV TZ=Europe/Kyiv
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]
