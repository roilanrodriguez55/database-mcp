# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Required to compile better-sqlite3 native bindings
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript only — databases.json is mounted at runtime
RUN npx tsc

# Strip dev dependencies from node_modules
RUN npm prune --production

# Stage 2: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# databases.json must be mounted at /app/databases.json:
#   docker run -i --rm -v /absolute/path/to/databases.json:/app/databases.json database-mcp
#
# For SQLite databases, also mount each .db file:
#   -v /absolute/path/to/app.db:/data/app.db
#   (update connectionString in databases.json to /data/app.db)
#
# To persist recorded migrations:
#   -v /absolute/path/to/migrations:/app/migrations

ENTRYPOINT ["node", "dist/index.js"]
