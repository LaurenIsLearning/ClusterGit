FROM ghcr.io/laurenislearning/clustergit-backend-base:latest

RUN apt-get update && apt-get install -y git-lfs && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 80

CMD ["npm", "start"]