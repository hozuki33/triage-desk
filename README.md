# 分诊台 TriageDesk

面向客服团队的工单工作台。用户提交工单后，系统自动分类、检索知识库并起草回复；客服在确认卡中审核，确认后才会发给来访。

在线访问：http://8.136.44.223

## 功能

- 三角色：来访 / 客服 / 管理员，工单按角色隔离
- 工单状态流转、认领与派单
- 确认卡：草稿可改，确认发送或驳回
- 分类与回复起草；低置信度转人工
- 知识库上传、混合检索与引用
- 操作审计；并发用版本号控制
- Agent 执行追踪：区分真实 LLM、本地规则与模型异常降级，不把失败伪装成 AI 成功

## 技术栈

React 18 · TypeScript · Ant Design · Fastify · Prisma · PostgreSQL / pgvector · LangChain · Transformers.js · Docker

## 核心设计

- 以状态机约束工单流转，结合角色权限、版本号乐观锁和审计日志保证协作安全。
- DeepSeek 负责分类与回复起草，知识检索提供依据，客服确认后才正式发送。
- 本地中文 Embedding + pgvector 语义检索，与 `pg_trgm` 关键词检索通过 RRF 融合；Embedding 异常时自动降级。
- 执行追踪只记录模型来源、检索模式和脱敏状态，不保存密钥、完整提示词或原始向量。

## 本地运行

需要 Node 20+、pnpm 和 Docker Desktop。

### 1. 准备配置

```bash
pnpm install
```

复制环境变量文件：

```powershell
# Windows PowerShell
Copy-Item apps/api/.env.example apps/api/.env
```

```bash
# macOS / Linux
cp apps/api/.env.example apps/api/.env
```

按需修改 `apps/api/.env`。本地数据库密码取自其中的 `DATABASE_URL`，模型调用需要填写对应的 API Key；`.env` 已被 Git 忽略。

### 2. 启动 Docker 数据库

打开 Docker Desktop，等待 Docker Engine 启动。可用下面两条命令检查：

```bash
docker version
docker compose version
```

如果提示找不到 `docker`，请重新打开终端；自定义安装目录的用户还需将 Docker 的 `resources/bin` 目录加入系统 `PATH`。

然后在项目根目录执行：

```bash
pnpm db:up:detached
```

该命令会自动下载 pgvector PostgreSQL 镜像，并在后台创建数据库，无需手动创建容器。

### 3. 初始化并启动项目

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- 前端 http://127.0.0.1:5173
- API http://127.0.0.1:3001/api/health

试用账号（密码均为 `desk-2026`）：`user` / `agent` / `admin`

停止项目后，如需关闭数据库容器：

```bash
pnpm db:down
```

数据库数据会保留在 Docker Volume 中，下次运行只需再次执行 `pnpm db:up:detached`。

## 验证

```bash
pnpm test
pnpm build
pnpm --filter @triagedesk/api eval:retrieval
```
