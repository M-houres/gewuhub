#!/bin/bash
# 完全清理并重新部署

echo "=== 完全清理并重新部署 ==="

# 1. 停止并删除所有容器
echo "停止所有服务..."
cd /root/gewuhub 2>/dev/null && docker compose down -v
docker stop $(docker ps -aq) 2>/dev/null
docker rm $(docker ps -aq) 2>/dev/null

# 2. 清理Docker镜像
echo "清理Docker镜像..."
docker system prune -af --volumes

# 3. 删除旧代码
echo "删除旧代码..."
cd /root
rm -rf gewuhub

# 4. 重新克隆
echo "克隆最新代码..."
git clone https://github.com/M-houres/gewuhub.git
cd gewuhub

# 5. 快速部署
echo "开始部署..."
bash super-fast-deploy.sh

echo "=== 清理部署完成 ==="
