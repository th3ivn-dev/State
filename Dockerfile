FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

ENV TZ=Europe/Kyiv

EXPOSE 3000

CMD ["node", "src/index.js"]
