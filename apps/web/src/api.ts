export type Role = "user" | "agent" | "admin";
export type TicketStatus =
  | "pending_classify"
  | "classify_failed"
  | "pending"
  | "in_progress"
  | "pending_confirm"
  | "replied"
  | "closed";
export type TicketEvent =
  | "claim"
  | "dispatch"
  | "save_draft"
  | "confirm_reply"
  | "reject_draft"
  | "cancel"
  | "close"
  | "run_agent"
  | "manual_classify";

export type PublicUser = {
  id: number;
  username: string;
  role: Role;
};

export type TicketReply = {
  id: number;
  content: string;
  source: "draft" | "human" | "ai";
  createdAt: string;
};

export type KnowledgeDoc = {
  id: number;
  title: string;
  content: string;
  status: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentTrace = {
  id: number;
  toolName: string;
  output: Record<string, unknown>;
  confidence: number | null;
  durationMs: number;
  createdAt: string;
};

export type Ticket = {
  id: number;
  title: string;
  content: string;
  category: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  author: PublicUser;
  assignee: PublicUser | null;
  replies: TicketReply[];
  traces: AgentTrace[];
  allowedActions: TicketEvent[];
};

export const statusLabel: Record<TicketStatus, string> = {
  pending_classify: "待分类",
  classify_failed: "分类待人工",
  pending: "待处理",
  in_progress: "处理中",
  pending_confirm: "待确认",
  replied: "已回复",
  closed: "已关闭",
};

export type AuditLog = {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
  actor: PublicUser;
  ticket: { id: number; title: string } | null;
};

export const actionLabel: Record<string, string> = {
  create: "开单",
  claim: "认领",
  dispatch: "派单",
  save_draft: "保存草稿",
  confirm_reply: "确认发送",
  reject_draft: "驳回草稿",
  cancel: "撤销",
  close: "关闭",
  agent_ok: "Agent 起草",
  agent_fail: "Agent 转人工",
  manual_classify: "人工分类",
  knowledge_create: "录入知识",
  knowledge_delete: "删除知识",
};

export const categoryLabel: Record<string, string> = {
  refund_issue: "退款问题",
  delivery_delay: "物流延迟",
  product_quality: "产品质量",
  account_security: "账号安全",
  billing_payment: "计费支付",
  feature_request: "功能需求",
  other: "其他",
};

type ApiError = { message: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("td_token");
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;

  if (response.status === 401) {
    localStorage.removeItem("td_token");
    localStorage.removeItem("td_user");
    if (!path.includes("/api/auth/login")) {
      window.location.assign("/login");
    }
  }

  if (!response.ok) {
    throw new Error(data.message || "请求失败");
  }
  return data;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<{ user: PublicUser }>("/api/auth/me"),
  tickets: (status?: string) =>
    request<{ tickets: Ticket[] }>(`/api/tickets${status ? `?status=${status}` : ""}`),
  ticket: (id: string) => request<{ ticket: Ticket }>(`/api/tickets/${id}`),
  createTicket: (title: string, content: string) =>
    request<{ ticket: Ticket }>("/api/tickets", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    }),
  claim: (id: number, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/claim`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  dispatch: (id: number, assigneeId: number, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/dispatch`, {
      method: "POST",
      body: JSON.stringify({ assigneeId, version }),
    }),
  saveDraft: (id: number, content: string, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/draft`, {
      method: "POST",
      body: JSON.stringify({ content, version }),
    }),
  confirmReply: (id: number, content: string, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ content, version }),
    }),
  rejectDraft: (id: number, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  cancel: (id: number, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  closeTicket: (id: number, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  runAgent: (id: number, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/agent`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  setCategory: (id: number, category: string, version: number) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}/category`, {
      method: "POST",
      body: JSON.stringify({ category, version }),
    }),
  agents: () => request<{ agents: PublicUser[] }>("/api/users/agents"),
  knowledge: () => request<{ docs: KnowledgeDoc[] }>("/api/knowledge"),
  createKnowledge: (title: string, content: string) =>
    request<{ doc: KnowledgeDoc }>("/api/knowledge", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    }),
  deleteKnowledge: (id: number) =>
    request<{ ok: boolean }>(`/api/knowledge/${id}`, { method: "DELETE" }),
  audit: (params?: { ticketId?: number; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.ticketId) query.set("ticketId", String(params.ticketId));
    if (params?.page) query.set("page", String(params.page));
    if (params?.pageSize) query.set("pageSize", String(params.pageSize));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ items: AuditLog[]; total: number; page: number; pageSize: number }>(
      `/api/audit${suffix}`,
    );
  },
};
