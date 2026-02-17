# chat created Dockerfile just to see if i can make it work
# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the backend source
COPY . .

# The app will listen on PORT (we’ll set it to 80)
EXPOSE 80

# Start the server
CMD ["node", "src/server.js"]
