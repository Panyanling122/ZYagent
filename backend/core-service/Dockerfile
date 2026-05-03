FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Create directories
RUN mkdir -p /app/uploads /app/logs /app/group-logs

# Expose ports
EXPOSE 3001 3003 3004

CMD ["node", "dist/index.js"]

