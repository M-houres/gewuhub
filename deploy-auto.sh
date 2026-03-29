#!/bin/bash
# 阿里云自动部署脚本

SERVER="47.95.177.112"
DOMAIN="restin.top"
KEY_PATH="C:/Users/m/Desktop/业务材料/阿里云"

echo "=== 开始部署到阿里云 ==="

# 1. 上传代码
echo "1. 上传代码..."
scp -i "$KEY_PATH" -r . root@$SERVER:/root/gewu.ai/

# 2. SSH执行部署
echo "2. 执行部署..."
ssh -i "$KEY_PATH" root@$SERVER << 'EOF'
cd /root/gewu.ai

# 创建.env文件
cat > .env << 'ENVEOF'
APP_WEB_BASE_URL=http://restin.top
NEXT_PUBLIC_API_BASE_URL=/api
VITE_API_BASE_URL=/api
NGINX_PORT=80

POSTGRES_DB=gewu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(openssl rand -base64 32)

API_PORT=4000
API_HOST=0.0.0.0

ADMIN_TOKEN=$(openssl rand -base64 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(openssl rand -base64 32)
ADMIN_ACCESS_TOKEN_TTL_SECONDS=43200
ACCESS_TOKEN_TTL_SECONDS=604800

SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_AUTH=true
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
SMTP_FROM_EMAIL=gwzz2023@qq.com
SMTP_FROM_NAME=Gewu

PAYMENT_CALLBACK_SECRET=$(openssl rand -base64 32)
GENERATED_FILE_SECRET=$(openssl rand -base64 32)
ENABLE_MOCK_PAYMENT=true
DOCX_WORKER_SECRET=$(openssl rand -base64 32)

STORE_PERSISTENCE_ENABLED=true
REDIS_URL=redis://redis:6379
ENABLE_QUEUE=true
API_INTERNAL_BASE_URL=http://api:4000

APP_ENV=production
RELEASE_VERSION=v1.0.0
ENVEOF

# 安装Docker
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi

# 启动服务
docker compose down
docker compose up -d --build

# 等待服务启动
sleep 30

# 初始化数据库
docker compose exec -T api npx prisma migrate deploy
docker compose exec -T api npx tsx src/seed-platforms.ts

echo "=== 部署完成 ==="
docker compose ps
EOF

echo "访问: http://restin.top"
