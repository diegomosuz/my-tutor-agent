FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Usuario no-root (Fase 7, sección 43). node:20-alpine ya trae el usuario
# "node" preconfigurado; solo hace falta ceder la propiedad de /app.
RUN chown -R node:node /app
USER node

EXPOSE 5173

CMD ["npm", "run", "dev"]
