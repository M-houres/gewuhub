#!/bin/bash
# 腾讯云一键部署

echo "=== 腾讯云部署 ==="

cd /root
rm -rf gewuhub

# 使用国内镜像
git clone https://gitee.com/mirrors/gewuhub.git || \
git clone https://ghproxy.com/https://github.com/M-houres/gewuhub.git

cd gewuhub

# 配置
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://你的域名
POSTGRES_PASSWORD=gewu2024
ADMIN_PASSWORD=Admin2024
SMTP_HOST=smtp.qq.com
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
EOF

# 安装Docker
curl -fsSL https://get.docker.com | sh

# 启动
docker compose up -d

echo "部署完成"
