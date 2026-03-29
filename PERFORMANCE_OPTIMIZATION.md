# 性能优化配置说明

## 已完成的优化

### 1. 数据库索引优化
- User表: 添加 createdAt, role+createdAt 索引
- Task表: 添加 userId+status, status+createdAt, userId+createdAt, type+status 索引
- Order表: 添加 userId+createdAt, status+createdAt 索引
- PointRecord表: 添加 userId+createdAt 索引

**应用方法**:
```bash
cd apps/api
npx prisma migrate dev --name add_performance_indexes
```

### 2. Nginx性能优化
- ✅ Gzip压缩（节省70%带宽）
- ✅ 限流配置（API 30req/s, Auth 10req/s）
- ✅ 安全响应头
- ✅ 静态资源缓存（7天）
- ✅ 超时控制

### 3. Docker资源限制
- API: 1核CPU, 1GB内存
- Worker: 0.5核CPU, 512MB内存
- PostgreSQL: 1核CPU, 1GB内存（优化参数）
- Redis: 0.5核CPU, 512MB内存（LRU策略）

### 4. PostgreSQL优化
- max_connections: 100
- shared_buffers: 256MB
- effective_cache_size: 1GB
- work_mem: 16MB

### 5. Redis优化
- maxmemory: 512MB
- maxmemory-policy: allkeys-lru
- 持久化: AOF

### 6. 数据库连接池
- 连接限制: 20
- 超时: 10秒

## 预期性能提升

- 数据库查询速度: 提升 50-80%
- API响应时间: 减少 30-50%
- 带宽使用: 减少 60-70%
- 并发处理能力: 提升 3-5倍

## 下一步建议

1. 应用数据库迁移
2. 重启Docker服务
3. 进行压力测试
4. 监控性能指标
