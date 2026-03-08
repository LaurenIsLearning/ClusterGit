#trigger
FROM ghcr.io/laurenislearning/clustergit-backend-base:latest

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY . .

EXPOSE 80

CMD ["node", "src/server.js"]