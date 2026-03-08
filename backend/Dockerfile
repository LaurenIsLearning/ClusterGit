FROM node:20

RUN apt-get update && \
    apt-get install -y git git-annex && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 80

CMD ["node", "src/server.js"]