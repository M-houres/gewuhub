# 阿里云部署步骤

## 服务器信息
- IP: 47.95.177.112
- 域名: restin.top
- 系统: Ubuntu 22.04

## 第1步：连接服务器

在本地PowerShell执行：
```powershell
ssh -i "C:\Users\m\Desktop\业务材料\阿里云\your-key.pem" root@47.95.177.112
```

## 第2步：克隆代码

```bash
cd /root
git clone https://github.com/M-houres/gewu.ai.git
cd gewu.ai
```

## 第3步：创建配置文件

```bash
cat > .env << 'EOF'
APP_WEB_BASE_URL=http://restin.top
NEXT_PUBLIC_API_BASE_URL=/api
VITE_API_BASE_URL=/api

POSTGRES_DB=gewu
POSTGRES_USER=postgres
POSTGRES_PASSWORD=GewuDB2024Secure

ADMIN_TOKEN=admin-token-2024-secure
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@2024Secure

SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=gwzz2023@qq.com
SMTP_PASS=Dniuclkkfpnsdbab
SMTP_FROM_EMAIL=gwzz2023@qq.com

ENABLE_MOCK_PAYMENT=true
EOF
```

## 第4步：安装Docker

```bash
curl -fsSL https://get.docker.com | sh
```

## 第5步：启动服务

```bash
docker compose up -d --build
```

## 第6步：初始化数据库

```bash
sleep 30
docker compose exec api npx prisma migrate deploy
docker compose exec api npx tsx src/seed-platforms.ts
```

## 完成！

访问: http://restin.top
后台: http://restin.top/admin
用户名: admin
密码: Admin@2024Secure
