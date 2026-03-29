# 上线前最终检查清单

## 数据库
- [ ] 运行迁移: `cd apps/api && npx prisma migrate deploy`
- [ ] 初始化平台: `npx tsx src/seed-platforms.ts`
- [ ] 检查索引已创建

## 环境变量
- [ ] 更改所有 `change-me-*` 密钥
- [ ] 配置SMTP邮件服务
- [ ] 配置支付密钥（微信/支付宝）
- [ ] 设置正确的域名

## 服务启动
- [ ] `docker compose up -d`
- [ ] 检查所有容器运行: `docker compose ps`
- [ ] 检查日志无错误: `docker compose logs`

## 功能测试
- [ ] 注册+邮箱验证
- [ ] 登录
- [ ] 创建任务（降重/检测）
- [ ] 创建订单
- [ ] 推广链接生成
- [ ] 后台登录
- [ ] 后台平台管理

## 性能检查
- [ ] API响应 < 500ms
- [ ] 数据库连接正常
- [ ] Redis缓存工作
- [ ] Nginx限流生效

全部检查通过即可上线！
