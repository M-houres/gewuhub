#!/bin/bash
# 阿里云快速部署（使用GitHub代理）

echo "=== Gewu.ai 快速部署 ==="

cd /root
rm -rf gewuhub

# 使用GitHub代理克隆
git clone https://ghproxy.com/https://github.com/M-houres/gewuhub.git

cd gewuhub

# 创建配置
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://restin.top
NEXT_PUBLIC_API_BASE_URL=/api
VITE_API_BASE_URL=/api
NGINX_PORT=80
POSTGRES_DB=gewu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=GewuSecure2024
API_PORT=4000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@2024Secure
ADMIN_TOKEN=admin-token-secure-2024
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

# 安装Docker
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
fi

# 启动服务
docker compose up -d --build

echo "等待服务启动..."
sleep 45

# 初始化数据库
docker compose exec -T api npx prisma migrate deploy
docker compose exec -T api npx tsx src/seed-platforms.ts

echo "=== 部署完成 ==="
echo "访问: http://restin.top"
echo "后台: http://restin.top/admin"
echo "用户名: admin"
echo "密码: Admin@2024Secure"
