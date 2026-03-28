FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/admin/package*.json apps/admin/
COPY apps/api/package*.json apps/api/
COPY apps/worker/package*.json apps/worker/

RUN npm ci

COPY . .

RUN npm run prisma:generate -w api && npm run build -w api

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "api"]
