#!/bin/bash
# 超快速部署（5分钟完成）

echo "=== 超快速部署 ==="

# 最小化配置
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://restin.top
POSTGRES_DB=gewu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=gewu2024
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin2024
SMTP_HOST=smtp.qq.com
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
ENABLE_MOCK_PAYMENT=true
EOF

# 分步启动（避免卡死）
echo "1. 启动数据库..."
docker compose up -d postgres redis
sleep 15

echo "2. 启动API..."
docker compose up -d api
sleep 20

echo "3. 初始化数据库..."
docker compose exec -T api npx prisma migrate deploy || echo "迁移失败，继续..."

echo "4. 启动前端..."
docker compose up -d web admin worker nginx

echo "完成！访问 http://restin.top"
