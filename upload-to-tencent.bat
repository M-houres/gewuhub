@echo off
echo === 上传代码到腾讯云 ===
echo.
echo 请输入腾讯云服务器IP:
set /p SERVER_IP=
echo.
echo 正在上传代码...
scp -r D:\deadline root@%SERVER_IP%:/root/gewuhub
echo.
echo 上传完成！
echo 现在SSH连接服务器并执行:
echo cd /root/gewuhub
echo bash super-fast-deploy.sh
pause
