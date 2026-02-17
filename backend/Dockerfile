# chat created Dockerfile just to see if i can make it work
# Use lightweight Node image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy rest of source code
COPY . .

# Expose port (matches your server.js default)
EXPOSE 80

# Start the server
CMD ["node", "src/server.js"]
