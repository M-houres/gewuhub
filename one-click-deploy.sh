#!/bin/bash
# 一键部署脚本

echo "=== Gewu.ai 一键部署 ==="

# 1. 安装Docker
if ! command -v docker &> /dev/null; then
    echo "安装Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# 2. 创建.env
echo "创建配置文件..."
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://restin.top
NEXT_PUBLIC_API_BASE_URL=/api
VITE_API_BASE_URL=/api
NGINX_PORT=80
POSTGRES_DB=gewu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=GewuDB2024
API_PORT=4000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@2024Secure
ADMIN_TOKEN=admin-token-2024
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
SMTP_FROM_EMAIL=gwzz2023@qq.com
ENABLE_MOCK_PAYMENT=true
STORE_PERSISTENCE_ENABLED=true
REDIS_URL=redis://redis:6379
ENABLE_QUEUE=true
EOF

# 3. 启动服务
echo "启动服务..."
docker compose up -d --build

# 4. 等待启动
echo "等待服务启动..."
sleep 40

# 5. 初始化数据库
echo "初始化数据库..."
docker compose exec -T api npx prisma migrate deploy
docker compose exec -T api npx tsx src/seed-platforms.ts

echo "=== 部署完成 ==="
echo "访问: http://restin.top"
echo "后台: http://restin.top/admin"
echo "用户名: admin"
echo "密码: Admin@2024Secure"
