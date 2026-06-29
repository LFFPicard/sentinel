FROM node:20-alpine
WORKDIR /app

# Copy shared package first
COPY shared/ ./shared/
RUN cd shared && npm ci

# Copy collector
COPY collector/package.json ./collector/
RUN cd collector && npm ci

COPY collector/ ./collector/
RUN cd collector && npm run build

WORKDIR /app/collector
CMD ["npm", "start"]