import { Button, Card, Descriptions, Input, Modal, Select, Space, Tag, Timeline, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, categoryLabel, statusLabel, type PublicUser, type Ticket, type TicketStatus } from "../api";
import { getUser } from "../session";

const statusColor: Record<TicketStatus, string> = {
  pending_classify: "purple",
  classify_failed: "red",
  pending: "gold",
  in_progress: "blue",
  pending_confirm: "orange",
  replied: "green",
  closed: "default",
};

function latestDraft(ticket: Ticket) {
  return [...ticket.replies].reverse().find((item) => item.source === "draft" || item.source === "ai");
}

export function TicketPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [draft, setDraft] = useState("");
  const [agents, setAgents] = useState<PublicUser[]>([]);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [category, setCategory] = useState("refund_issue");
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function load() {
    if (!id) return;
    const data = await api.ticket(id);
    setTicket(data.ticket);
    setDraft(latestDraft(data.ticket)?.content ?? "");
    if (data.ticket.category) setCategory(data.ticket.category);
  }

  useEffect(() => {
    void load().catch((err) => message.error(err instanceof Error ? err.message : "找不到这张单"));
  }, [id]);

  async function run(action: () => Promise<{ ticket: Ticket }>, ok = "已更新") {
    setPending(true);
    try {
      const result = await action();
      setTicket(result.ticket);
      setDraft(latestDraft(result.ticket)?.content ?? draft);
      message.success(ok);
    } catch (err) {
      const text = err instanceof Error ? err.message : "操作失败";
      message.error(text);
      if (text.includes("刷新")) {
        void load();
      }
    } finally {
      setPending(false);
    }
  }

  async function openDispatch() {
    try {
      const data = await api.agents();
      setAgents(data.agents);
      setAssigneeId(data.agents[0]?.id ?? null);
      setDispatchOpen(true);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "无法加载客服名单");
    }
  }

  if (!ticket) {
    return <Card loading />;
  }

  const actions = ticket.allowedActions;
  const sent = ticket.replies.filter((item) => item.source === "human");
  const staff = me?.role === "agent" || me?.role === "admin";
  const showConfirmCard = staff && (actions.includes("save_draft") || actions.includes("confirm_reply"));
  const draftItem = latestDraft(ticket);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Typography.Text style={{ fontFamily: "IBM Plex Mono, monospace" }}>
            NO.{String(ticket.id).padStart(4, "0")}
          </Typography.Text>
          <Tag color={statusColor[ticket.status]}>{statusLabel[ticket.status]}</Tag>
          {ticket.category ? <Tag>{categoryLabel[ticket.category] ?? ticket.category}</Tag> : null}
        </Space>
        <Typography.Title level={3} style={{ fontFamily: "Instrument Serif, serif" }}>
          {ticket.title}
        </Typography.Title>
        <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="来访">{ticket.author.username}</Descriptions.Item>
          <Descriptions.Item label="客服">{ticket.assignee?.username ?? "未派"}</Descriptions.Item>
          <Descriptions.Item label="版本">
            <Typography.Text style={{ fontFamily: "IBM Plex Mono, monospace" }}>REV.{ticket.version}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap", fontSize: 16 }}>
          {ticket.content}
        </Typography.Paragraph>
        <Space wrap>
          {actions.includes("claim") ? (
            <Button type="primary" loading={pending} onClick={() => run(() => api.claim(ticket.id, ticket.version), "已认领")}>
              认领
            </Button>
          ) : null}
          {actions.includes("run_agent") ? (
            <Button loading={pending} onClick={() => run(() => api.runAgent(ticket.id, ticket.version), "Agent 已跑完")}>
              重跑 Agent
            </Button>
          ) : null}
          {actions.includes("manual_classify") ? (
            <Space>
              <Select
                style={{ width: 140 }}
                value={category}
                onChange={setCategory}
                options={Object.entries(categoryLabel).map(([value, label]) => ({ value, label }))}
              />
              <Button loading={pending} onClick={() => run(() => api.setCategory(ticket.id, category, ticket.version), "已人工分类")}>
                人工分类
              </Button>
            </Space>
          ) : null}
          {actions.includes("dispatch") ? (
            <Button loading={pending} onClick={() => void openDispatch()}>
              派单
            </Button>
          ) : null}
          {actions.includes("cancel") ? (
            <Button loading={pending} onClick={() => run(() => api.cancel(ticket.id, ticket.version), "已撤销")}>
              撤销
            </Button>
          ) : null}
          {actions.includes("close") ? (
            <Button danger loading={pending} onClick={() => run(() => api.closeTicket(ticket.id, ticket.version), "已关闭")}>
              关闭
            </Button>
          ) : null}
          <Button onClick={() => navigate("/inbox")}>返回收件匣</Button>
        </Space>
      </Card>

      {showConfirmCard ? (
        <Card
          title="确认卡"
          extra={
            <Typography.Text type="secondary">
              {draftItem?.source === "ai" ? "Agent 预填 · 人确认后才发送" : "人确认后才发送"}
            </Typography.Text>
          }
        >
          <Input.TextArea
            rows={8}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Agent 会预填草稿；你可以直接改，确认后才发给来访。"
          />
          <Space wrap style={{ marginTop: 12 }}>
            {actions.includes("save_draft") ? (
              <Button loading={pending} onClick={() => run(() => api.saveDraft(ticket.id, draft, ticket.version), "草稿已保存")}>
                保存草稿
              </Button>
            ) : null}
            {actions.includes("confirm_reply") ? (
              <Button
                type="primary"
                loading={pending}
                onClick={() => run(() => api.confirmReply(ticket.id, draft, ticket.version), "已发送")}
              >
                确认发送
              </Button>
            ) : null}
            {actions.includes("reject_draft") ? (
              <Button loading={pending} onClick={() => run(() => api.rejectDraft(ticket.id, ticket.version), "已驳回，回到处理中")}>
                驳回草稿
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}

      {staff && (ticket.traces ?? []).length > 0 ? (
        <Card title="Agent 追踪">
          <Timeline
            items={(ticket.traces ?? []).map((item) => ({
              color: item.toolName === "classify" ? "blue" : item.toolName === "retrieve" ? "green" : "gold",
              children: (
                <div>
                  <Typography.Text strong>
                    {item.toolName === "classify"
                      ? "分类"
                      : item.toolName === "retrieve"
                        ? "检索知识库"
                        : "起草回复"}
                  </Typography.Text>
                  <Typography.Text type="secondary"> · {item.durationMs}ms</Typography.Text>
                  {item.confidence != null ? (
                    <Typography.Text type="secondary"> · 置信度 {(item.confidence * 100).toFixed(0)}%</Typography.Text>
                  ) : null}
                  <Typography.Paragraph style={{ margin: "6px 0 0" }} type="secondary">
                    {typeof item.output.reason === "string"
                      ? item.output.reason
                      : Array.isArray(item.output.titles)
                        ? item.output.titles.length
                          ? `命中 ${item.output.titles.join("、")}`
                          : "没有匹配条文"
                        : typeof item.output.draft === "string"
                          ? "已生成回复草稿"
                          : JSON.stringify(item.output)}
                  </Typography.Paragraph>
                </div>
              ),
            }))}
          />
        </Card>
      ) : null}

      {sent.length > 0 ? (
        <Card title="已发送的回复">
          <Timeline
            items={sent.map((item) => ({
              color: item.source === "ai" ? "gold" : "green",
              children: (
                <div>
                  <Typography.Text type="secondary">
                    {item.source === "ai" ? "AI 草稿已确认" : "客服回复"} · {new Date(item.createdAt).toLocaleString()}
                  </Typography.Text>
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
                    {item.content}
                  </Typography.Paragraph>
                </div>
              ),
            }))}
          />
        </Card>
      ) : null}

      <Modal
        title="派给客服"
        open={dispatchOpen}
        onCancel={() => setDispatchOpen(false)}
        onOk={() => {
          if (!assigneeId) return;
          void run(() => api.dispatch(ticket.id, assigneeId, ticket.version), "已派单").then(() => setDispatchOpen(false));
        }}
      >
        <Select
          style={{ width: "100%" }}
          value={assigneeId ?? undefined}
          onChange={setAssigneeId}
          options={agents.map((agent) => ({
            value: agent.id,
            label: `${agent.username} (${agent.role})`,
          }))}
        />
      </Modal>
    </Space>
  );
}
