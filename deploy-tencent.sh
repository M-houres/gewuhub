#!/bin/bash
# 腾讯云部署脚本（使用Gitee镜像）

echo "=== 腾讯云部署 ==="

# 方案1：使用Gitee镜像（推荐）
cd /root
rm -rf gewuhub

# 先同步到Gitee
# 在本地执行：git remote add gitee https://gitee.com/你的用户名/gewuhub.git
# git push gitee main

# 从Gitee克隆（国内速度快）
git clone https://gitee.com/你的用户名/gewuhub.git

# 方案2：使用GitHub代理
# git clone https://ghproxy.com/https://github.com/M-houres/gewuhub.git

cd gewuhub

# 创建.env
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://你的域名
POSTGRES_PASSWORD=$(openssl rand -base64 32)
ADMIN_PASSWORD=$(openssl rand -base64 32)
SMTP_HOST=smtp.qq.com
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
EOF

# 安装Docker
curl -fsSL https://get.docker.com | sh

# 启动
docker compose up -d --build
sleep 40
docker compose exec -T api npx prisma migrate deploy
docker compose exec -T api npx tsx src/seed-platforms.ts

echo "部署完成"
