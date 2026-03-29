# 平台配置化改造 + 新功能实施指南

## ✅ 已完成内容

### 1. 数据库Schema
- Platform表：平台管理（code, name, enabled, sortOrder, taskTypes）
- RulePackage表：规则版本管理（version, hash, isActive, status）
- AuditLog表：操作审计日志

### 2. 后端服务
- platform-service.ts：平台管理核心逻辑
  - getEnabledPlatforms()：获取启用平台
  - uploadRulePackage()：上传规则
  - publishRulePackage()：发布规则
  - rollbackRule()：回滚版本

### 3. 前端组件
- Admin：platform-manage-page.tsx（平台管理页面）
- Web：usePlatforms hook（动态获取平台）

### 4. 新增功能
- 文献综述生成（academic-writing.ts）
- 开题报告生成

## 实施步骤

### 第1步：应用数据库迁移
```bash
cd apps/api
npx prisma migrate dev --name add_platform_management
npx tsx src/seed-platforms.ts
```

### 第2步：验证功能
- 后台：访问 /admin/platforms 管理平台
- 前台：检测页面自动显示知网、维普

### 第3步：上传规则（后台操作）
1. 选择平台（知网/维普）
2. 选择任务类型（检测/降重）
3. 上传JSON规则文件
4. 点击"发布生效"

## 核心特性

✅ 运营驱动：后台配置，前台自动生效
✅ 版本管理：支持发布、回滚
✅ 审计日志：所有操作可追溯
✅ 默认启用：仅知网、维普
✅ 扩展性：新增平台无需改代码

## 完成度：100%
