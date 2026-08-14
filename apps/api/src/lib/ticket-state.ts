export const TicketStatus = {
  PendingClassify: "pending_classify",
  ClassifyFailed: "classify_failed",
  Pending: "pending",
  InProgress: "in_progress",
  PendingConfirm: "pending_confirm",
  Replied: "replied",
  Closed: "closed",
} as const;

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];
export type TicketEvent =
  | "claim"
  | "dispatch"
  | "save_draft"
  | "confirm_reply"
  | "reject_draft"
  | "cancel"
  | "close"
  | "agent_ok"
  | "agent_fail"
  | "manual_classify"
  | "run_agent";

const transitions: Record<TicketStatus, Partial<Record<TicketEvent, TicketStatus>>> = {
  pending_classify: {
    agent_ok: "pending_confirm",
    agent_fail: "classify_failed",
    claim: "in_progress",
    dispatch: "in_progress",
    cancel: "closed",
  },
  classify_failed: {
    agent_ok: "pending_confirm",
    agent_fail: "classify_failed",
    manual_classify: "in_progress",
    claim: "in_progress",
    dispatch: "in_progress",
  },
  pending: {
    claim: "in_progress",
    dispatch: "in_progress",
    cancel: "closed",
    agent_ok: "pending_confirm",
    agent_fail: "classify_failed",
  },
  in_progress: {
    save_draft: "pending_confirm",
    agent_ok: "pending_confirm",
    close: "closed",
  },
  pending_confirm: {
    save_draft: "pending_confirm",
    confirm_reply: "replied",
    reject_draft: "in_progress",
  },
  replied: {
    close: "closed",
  },
  closed: {},
};

export function transition(from: string, event: TicketEvent): TicketStatus {
  const target = transitions[from as TicketStatus]?.[event];
  if (!target) {
    throw Object.assign(new Error(`不能从「${from}」执行 ${event}`), { statusCode: 409 });
  }
  return target;
}

export function getAllowedActions(params: {
  status: string;
  role: string;
  isAuthor: boolean;
}): TicketEvent[] {
  const { status, role, isAuthor } = params;
  const events = Object.keys(transitions[status as TicketStatus] ?? {}) as TicketEvent[];
  const extras: TicketEvent[] = [];
  if (
    (role === "agent" || role === "admin") &&
    ["pending_classify", "classify_failed", "pending", "in_progress"].includes(status)
  ) {
    extras.push("run_agent");
  }
  if ((role === "agent" || role === "admin") && status === "classify_failed") {
    extras.push("manual_classify");
  }
  return [...events, ...extras].filter((event) => {
    if (event === "claim") return role === "agent" || role === "admin";
    if (event === "dispatch") return role === "admin";
    if (event === "save_draft" || event === "confirm_reply" || event === "reject_draft") {
      return role === "agent" || role === "admin";
    }
    if (event === "manual_classify" || event === "run_agent") return role === "agent" || role === "admin";
    if (event === "agent_ok" || event === "agent_fail") return false;
    if (event === "close") return role === "agent" || role === "admin" || isAuthor;
    if (event === "cancel") return isAuthor || role === "admin";
    return role === "admin";
  });
}

export const statusLabel: Record<string, string> = {
  pending_classify: "待分类",
  classify_failed: "分类待人工",
  pending: "待处理",
  in_progress: "处理中",
  pending_confirm: "待确认",
  replied: "已回复",
  closed: "已关闭",
};
