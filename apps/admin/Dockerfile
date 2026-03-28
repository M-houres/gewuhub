FROM node:20-slim

WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV NODE_ENV=production

COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY apps/admin/package*.json apps/admin/
COPY apps/api/package*.json apps/api/
COPY apps/worker/package*.json apps/worker/

RUN npm ci

COPY . .

RUN npm run build -w admin

EXPOSE 4173

CMD ["npm", "run", "preview", "-w", "admin", "--", "--host", "0.0.0.0", "--port", "4173"]
