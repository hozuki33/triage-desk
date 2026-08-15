# 分诊台 TriageDesk

面向客服团队的工单工作台。用户提交工单后，系统自动分类、检索知识库并起草回复；客服在确认卡中审核，确认后才会发给来访。

在线访问：http://8.136.44.223

## 功能

- 三角色：来访 / 客服 / 管理员，工单按角色隔离
- 工单状态流转、认领与派单
- 确认卡：草稿可改，确认发送或驳回
- 分类与回复起草；低置信度转人工
- 知识库上传与引用
- 操作审计；并发用版本号控制
- Agent 执行追踪：区分真实 LLM、本地规则与模型异常降级，不把失败伪装成 AI 成功

## 技术栈

React 18 · Ant Design 6 · Fastify · Prisma · PostgreSQL

## Agent 执行模式

- 未配置 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`：使用确定性本地规则，追踪标记为“本地规则”，便于离线开发。
- 已配置 Key 且调用成功：分类与起草由兼容 OpenAI 协议的模型完成，追踪标记为“LLM”。
- 已配置 Key 但鉴权、限流、超时或服务异常：仅记录经过脱敏的错误代码，工单转入人工分类。


## 本地运行

需要 Node 20+ 和 pnpm。

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
```

终端一：启动数据库（保持不关）

```bash
pnpm db:up
```

终端二：

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- 前端 http://127.0.0.1:5173
- API http://127.0.0.1:3001/api/health

试用账号（密码均为 `desk-2026`）：`user` / `agent` / `admin`

