#!/bin/bash
# 安全检查脚本

echo "=== 安全配置检查 ==="

# 1. 检查默认密码
if grep -q "change-me" .env 2>/dev/null; then
    echo "❌ 警告：发现默认密码，请修改"
    exit 1
fi

# 2. 检查HTTPS
if ! grep -q "https://" .env 2>/dev/null; then
    echo "⚠️  建议：配置HTTPS"
fi

# 3. 检查密钥强度
if grep -E "password.*[0-9]{4}" .env 2>/dev/null; then
    echo "❌ 警告：密码强度不足"
    exit 1
fi

echo "✅ 安全检查通过"
