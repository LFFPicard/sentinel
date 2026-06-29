FROM node:20-alpine
WORKDIR /app

COPY shared/ ./shared/
RUN cd shared && npm ci

COPY api/package.json ./api/
RUN cd api && npm ci

COPY api/ ./api/
RUN cd api && npm run build

WORKDIR /app/api
CMD ["npm", "start"]