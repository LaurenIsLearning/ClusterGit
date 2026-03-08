FROM node:20-alpine

RUN apk add --no-cache git git-annex

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 80

CMD ["node", "src/server.js"]