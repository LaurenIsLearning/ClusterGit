#trigger
FROM ghcr.io/laurenislearning/clustergit-backend-base:latest
#trigger again
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 80

CMD ["npm", "start"]