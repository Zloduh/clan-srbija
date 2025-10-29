# Lightweight Node image
FROM node:20-alpine
WORKDIR /app

# Install deps
COPY package.json package-lock.json* .npmrc* ./
RUN npm install --production

# Copy source
COPY . .

# Expose port
EXPOSE 8787

# Run
CMD ["node", "index.js"]
