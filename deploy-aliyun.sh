#!/bin/bash
# 阿里云部署脚本

echo "=== 阿里云部署开始 ==="

# 1. 更新代码
git pull origin main

# 2. 安装依赖
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
cd apps/admin && npm install && cd ../..

# 3. 数据库迁移
cd apps/api
npx prisma migrate deploy
npx tsx src/seed-platforms.ts
cd ../..

# 4. 构建并启动
docker compose down
docker compose up -d --build

# 5. 健康检查
sleep 30
docker compose ps

echo "=== 部署完成 ==="
