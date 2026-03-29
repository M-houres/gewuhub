#!/bin/bash

echo "=== 性能优化应用脚本 ==="
echo ""

cd "$(dirname "$0")"

echo "1. 应用数据库索引..."
cd apps/api
npx prisma migrate dev --name add_performance_indexes
cd ../..

echo ""
echo "2. 重启Docker服务..."
docker compose down
docker compose up -d

echo ""
echo "3. 等待服务启动..."
sleep 30

echo ""
echo "4. 检查服务状态..."
docker compose ps

echo ""
echo "=== 优化完成 ==="
echo ""
echo "性能提升预期："
echo "- 数据库查询: +50-80%"
echo "- API响应: -30-50%"
echo "- 带宽使用: -60-70%"
echo ""
echo "建议进行压力测试验证效果"
