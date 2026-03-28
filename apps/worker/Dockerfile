FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/admin/package*.json apps/admin/
COPY apps/api/package*.json apps/api/
COPY apps/worker/package*.json apps/worker/

RUN npm ci

COPY . .

RUN npm run build -w worker

CMD ["npm", "run", "start", "-w", "worker"]
