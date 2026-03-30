#!/bin/bash
# 阿里云极速部署（使用国内镜像）

echo "=== 极速部署 ==="

cd /root
rm -rf gewuhub

# 使用gitee镜像（需要先同步）
git clone https://gitee.com/你的用户名/gewuhub.git || \
git clone https://ghproxy.com/https://github.com/M-houres/gewuhub.git

cd gewuhub

# 配置npm国内镜像
cat > .npmrc << 'EOF'
registry=https://registry.npmmirror.com
EOF

# 最小配置
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://restin.top
POSTGRES_PASSWORD=gewu2024
ADMIN_PASSWORD=Admin2024
SMTP_HOST=smtp.qq.com
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
EOF

# 安装Docker
curl -fsSL https://get.docker.com | sh

# 分步构建（避免卡死）
docker compose build postgres redis
docker compose up -d postgres redis
sleep 15

docker compose build api
docker compose up -d api
sleep 20

docker compose build web admin worker
docker compose up -d web admin worker nginx

echo "部署完成"
