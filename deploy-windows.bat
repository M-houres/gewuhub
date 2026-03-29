@echo off
chcp 65001
echo === Gewu.ai 阿里云部署脚本 ===
echo.
echo 服务器: 47.95.177.112
echo 域名: restin.top
echo.

set PROJECT_PATH=D:\deadline

echo [1/2] 推送最新代码到GitHub...
cd /d %PROJECT_PATH%
git add .
git commit -m "部署更新 %date% %time%"
git push origin main

echo.
echo [2/2] 请复制以下命令到阿里云服务器执行：
echo ================================================
echo cd /root
echo rm -rf gewuhub
echo git clone https://github.com/M-houres/gewuhub.git
echo cd gewuhub
echo bash one-click-deploy.sh
echo ================================================
echo.
echo 部署完成后访问: http://restin.top
echo 后台: http://restin.top/admin
echo 用户名: admin
echo 密码: Admin@2024Secure
echo.
pause

