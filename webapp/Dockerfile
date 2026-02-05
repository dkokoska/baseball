# Stage 1: Build the React Application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend (outputs to /app/dist)
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server code
COPY ./server ./server

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server/server.js"]
