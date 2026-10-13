FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# imagens das questões: monte um volume em /app/midia no Easypanel para não perder a cada deploy
RUN mkdir -p /app/midia && chown -R node:node /app/midia
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
