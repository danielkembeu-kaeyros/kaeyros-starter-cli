# Build Stage
FROM node:20.18.0 AS build
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install --os=linux --cpu=x64 sharp

# Copy all source files and configuration
COPY . .

# Generate Prisma client (must be done before build)
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# Preprod Stage
FROM node:20.18.0 AS preprod
WORKDIR /app

# Copy package files and node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules

# Copy build output
COPY --from=build /app/dist ./dist

# Copy mail templates if they exist
COPY --from=build /app/mail ./mail

# TEMPORAIRE: Installer handlebars explicitement avant le prune
RUN npm install handlebars --save

# Remove development dependencies (but keep handlebars)
RUN npm prune --omit=dev

# Debug: Vérifier que handlebars est présent
RUN echo "=== Handlebars check ===" && \
    npm list handlebars || echo "handlebars not found" && \
    ls -la node_modules/ | grep handlebars || echo "no handlebars folder"

# Production Stage
FROM gcr.io/distroless/nodejs20
WORKDIR /app

# Copy all necessary files from preprod
COPY --from=preprod /app/package*.json ./
COPY --from=preprod /app/node_modules ./node_modules
COPY --from=preprod /app/dist ./dist
COPY --from=preprod /app/mail ./mail

EXPOSE 3000

# Start the application 
CMD ["dist/main.js"]
