FROM ghcr.io/laurenislearning/clustergit-backend-base:latest

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 80

CMD ["node", "src/server.js"]