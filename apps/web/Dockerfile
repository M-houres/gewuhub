FROM node:20-bookworm-slim

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NODE_ENV=production

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/admin/package*.json apps/admin/
COPY apps/api/package*.json apps/api/
COPY apps/worker/package*.json apps/worker/

RUN npm ci

COPY . .

RUN npm run build -w web

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "web", "--", "--hostname", "0.0.0.0", "--port", "3000"]
