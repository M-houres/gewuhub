# Docker Desktop 安装和本地运行指南

## 第1步：安装Docker Desktop

1. 访问：https://www.docker.com/products/docker-desktop/
2. 下载Windows版本
3. 双击安装包安装
4. 安装完成后重启电脑

## 第2步：启动Docker Desktop

1. 打开Docker Desktop应用
2. 等待Docker引擎启动（右下角图标变绿）

## 第3步：启动项目

打开PowerShell，执行：

```powershell
cd D:\deadline
docker compose up -d
```

## 第4步：等待服务启动

```powershell
# 等待30秒
Start-Sleep -Seconds 30

# 检查服务状态
docker compose ps
```

## 第5步：访问网站

- 前台：http://localhost
- 后台：http://localhost/admin
  - 用户名：admin
  - 密码：Admin@2024Secure

## 停止服务

```powershell
docker compose down
```
