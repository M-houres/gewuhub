#!/bin/bash
# 使用Gitee镜像克隆

cd /root

# 方法1：使用代理
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7890

# 方法2：使用GitHub镜像
git clone https://ghproxy.com/https://github.com/M-houres/gewu.ai.git

# 如果还是失败，使用以下命令手动上传
# 在本地执行：scp -r D:\deadline root@47.95.177.112:/root/gewu.ai
