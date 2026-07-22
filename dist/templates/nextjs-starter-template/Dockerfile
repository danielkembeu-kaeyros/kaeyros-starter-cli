FROM node:20.18.0 AS build
WORKDIR /app

# Préparer les fichiers
COPY package.json package-lock.json /app/
RUN npm install 
COPY . /app

# Injecte la variable AVANT le build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build


# Étape intermédiaire (prune + récup assets)
FROM node:20.18.0 AS preprod
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public    
RUN npm prune --omit=dev


# Image finale légère
FROM gcr.io/distroless/nodejs20
WORKDIR /app
COPY --from=preprod /app /app
EXPOSE 3000
CMD ["./node_modules/next/dist/bin/next", "start"]
