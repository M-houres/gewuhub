# Gewu（格物）进度审计（2026-03-27）

## 本轮新增完成

- 修复 monorepo React 冲突：统一锁定到 `react@18.3.1 / react-dom@18.3.1`，`web/admin/api/worker` 构建全部恢复。
- 新增长文本真实流式链路（已完成于前一轮）：`POST /api/v1/tasks/stream`，服务端点数校验、扣减、失败退款、SSE 分片输出。
- 新增数据库持久化增强（本轮）：
  - `apps/api/src/store.ts` 增加 `exportStoreSnapshot / hydrateStoreSnapshot`。
  - `apps/api/src/state-persistence.ts` 增加基于 `Prisma + PostgreSQL` 的快照持久化能力（可开关）。
  - `apps/api/src/server.ts` 集成启动回灌、请求后延迟持久化、周期持久化、关停落盘。
  - 新增环境变量 `STORE_PERSISTENCE_ENABLED=true`（`apps/api/.env.example`）。
- 新增视觉对标自动化脚本：
  - `scripts/screenshot-original.mjs`、`scripts/screenshot-current.mjs`、`scripts/screenshot-runner.mjs`。
  - `scripts/compare.js` 重写为稳定 ASCII 输出，支持 `research/compare-report.json`。
  - 根脚本新增：`screenshots:original`、`screenshots:current`、`compare:screenshots`。
- 新增“防乱码再犯”工程化措施：
  - `scripts/check-mojibake.mjs` 重写，纳入源码目录检测并在 `npm run lint` 前执行。
  - 清理了用户端营销页面中的乱码文案，统一为可读英文文案。
- 新增“本地可复现视觉对标”能力：
  - `scripts/screenshot-current-local.mjs`：自动拉起本地 web（Next start）并截图，结束后自动回收进程。
  - `scripts/compare.js` 支持目录与报告路径环境变量，允许并行维护多套对比基线（如 `*-v2`）。
  - 真实对比基线已产出：`research/compare-report-v2.json`。

## 视觉对标当前数字（public 页）

- `home-desktop.png`: `6.70%`
- `home-mobile.png`: `11.79%`
- `pricing-desktop.png`: `6.96%`
- `tutorials-desktop.png`: `4.34%`
- `login-desktop.png`: `5.40%`
- `register-desktop.png`: `5.40%`

说明：当前差异主要来自“站点结构与路由行为”差异（speedai 多页面会回到应用工作台），下一轮将优先收敛路由与布局骨架，再压视觉 token 细节。

## 本轮新增进展（黑客松加速）

- 路由行为对齐 speedai：
  - `/`、`/pricing`、`/tutorials`、`/login`、`/register` 统一重定向到 `/zh/AI-search`。
- 新增独立认证入口，避免业务登录能力丢失：
  - `/auth/login`
  - `/auth/register`
- 工作台改为“游客可见，登录后提交任务”模式：
  - 可未登录浏览工作台与功能页骨架
  - 触发提交时再跳转认证入口
- 视觉流水线增强：
  - `scripts/screenshot-runner.mjs` 去掉工作台页 `requiresAuth`，当前一轮可自动采集 13 张对比图。

## 最新像素差异（13 页）

- `home-desktop.png`: `5.80%`
- `home-mobile.png`: `5.96%`
- `pricing-desktop.png`: `6.18%`
- `tutorials-desktop.png`: `6.18%`
- `login-desktop.png`: `6.18%`
- `register-desktop.png`: `6.18%`
- `ai-search-desktop.png`: `6.37%`
- `detect-desktop.png`: `6.71%`
- `reduce-ai-empty.png`: `6.81%`
- `reduce-repeat-desktop.png`: `6.84%`
- `points-desktop.png`: `6.88%`
- `reduce-ai-input.png`: `6.95%`
- `reduce-ai-loading.png`: `5.78%`

对应报告：`research/compare-report-v2.json`
- 工具链稳定性修复：
  - 发现 Prisma 7 与现有 schema 不兼容（生成 client 失败），已工程化修复为 Prisma 6 LTS（`@prisma/client/prisma`）。

## 当前验证结果

- `npm run build -w web` ✅
- `npm run build -w admin` ✅
- `npm run build -w api` ✅
- `npm run build -w worker` ✅
- `npm run lint -w web` ✅
- `node scripts/smoke-critical.mjs` ✅（全套通过）

## 对照“付费网站清单”状态（核心）

### 已完成（核心链路）

- 注册/登录/登出、邮箱验证、找回密码。
- Token 失效处理、未登录访问保护。
- 服务端扣积分与并发锁（同用户串行关键扣费操作）。
- AI 失败退款、积分变动日志、积分明细可查。
- 支付回调签名校验与幂等（当前 mock 网关）。
- 订单与充值记录、退款逻辑（已消费积分按可退额度处理）。
- 文件下载票据鉴权（一次性 ticket + 所有权校验）。
- 所有 AI 接口登录校验、管理后台独立认证。
- 模型 Key 后台可配，不硬编码。
- 404/全局错误页、Sentry 钩子、用户协议/隐私页。

### 仍待推进（你已允许暂缓/后续做）

- Google OAuth（你已确认暂不做）。
- 真实支付网关接入（你已确认先保留 mock）。
- OSS 真实上传与生命周期策略（当前是占位链路 + 下载鉴权）。
- 完整关系型数据建模（当前为“内存业务 + Postgres 快照持久化”过渡方案）。
- 与 speedai 的视觉/交互像素级 1:1 收敛（持续迭代中）。

## 下一阶段计划（高优先级）

1. 把快照持久化升级为“核心实体 Prisma 表直写”（用户/积分/任务/订单/模型/导航）。
2. 接入真实 OSS（签名上传、回调、对象清理策略、权限隔离）。
3. 跑视觉差异闭环（`original/current/diff`）分批压低差异率。
4. 对管理后台补齐运营审计能力（操作日志、异常告警、费用趋势）。
