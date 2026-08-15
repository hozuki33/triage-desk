import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getAllowedActions, transition, type TicketEvent } from "../lib/ticket-state.js";
import { runTicketAgent } from "../agent/orchestrator.js";
import { CATEGORIES } from "../lib/categories.js";
import { applyTicketChange, HttpError, readVersion, writeAudit } from "../lib/ticket-lock.js";
import { rejectAssignment, ticketWhere } from "../lib/ticket-visibility.js";

const ticketInclude = {
  author: { select: { id: true, username: true, role: true } },
  assignee: { select: { id: true, username: true, role: true } },
  replies: { orderBy: { createdAt: "asc" as const } },
  traces: { orderBy: { createdAt: "asc" as const } },
};

function withActions(
  ticket: {
    status: string;
    authorId: number;
    assigneeId: number | null;
    replies: { id: number; content: string; source: string; createdAt: Date }[];
    traces?: unknown[];
  },
  user: { sub: number; role: string },
) {
  const replies =
    user.role === "user" ? ticket.replies.filter((item) => item.source === "human") : ticket.replies;
  return {
    ...ticket,
    replies,
    traces: user.role === "user" ? [] : ticket.traces ?? [],
    allowedActions: getAllowedActions({
      status: ticket.status,
      role: user.role,
      isAuthor: ticket.authorId === user.sub,
    }),
  };
}

function sendError(reply: FastifyReply, error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }
  const message = error instanceof Error ? error.message : fallback;
  const statusCode =
    error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 409;
  return reply.code(statusCode).send({ message });
}

async function loadVisible(id: number, user: { sub: number; role: string }) {
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...ticketWhere(user) },
    include: ticketInclude,
  });
  if (!ticket) return null;
  return withActions(ticket, user);
}

async function loadAfterWrite(id: number, user: { sub: number; role: string }) {
  const ticket = await prisma.ticket.findFirstOrThrow({
    where: { id },
    include: ticketInclude,
  });
  return withActions(ticket, user);
}

export async function ticketRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/api/tickets", async (request) => {
    const status = (request.query as { status?: string }).status;
    const tickets = await prisma.ticket.findMany({
      where: {
        ...ticketWhere(request.user),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: ticketInclude,
    });
    return { tickets: tickets.map((ticket) => withActions(ticket, request.user)) };
  });

  app.post("/api/tickets", async (request, reply) => {
    const body = request.body as { title?: string; content?: string };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";

    if (title.length < 2 || title.length > 120) {
      return reply.code(400).send({ message: "标题需要 2–120 个字符" });
    }
    if (content.length < 4) {
      return reply.code(400).send({ message: "请把问题写清楚一些" });
    }

    const created = await prisma.ticket.create({
      data: {
        title,
        content,
        authorId: request.user.sub,
      },
    });
    await writeAudit({
      actorId: request.user.sub,
      action: "create",
      ticketId: created.id,
      toStatus: created.status,
      detail: { title },
    });
    try {
      await runTicketAgent(created.id, {
        actorId: request.user.sub,
        expectedVersion: created.version,
      });
    } catch (error) {
      request.log.error(error);
    }
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { id: created.id },
      include: ticketInclude,
    });
    return reply.code(201).send({ ticket: withActions(ticket, request.user) });
  });

  app.get("/api/tickets/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const ticket = await loadVisible(id, request.user);
    if (!ticket) {
      return reply.code(404).send({ message: "工单不存在" });
    }
    return { ticket };
  });

  app.post("/api/tickets/:id/claim", async (request, reply) => {
    if (request.user.role !== "agent" && request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有客服可以认领" });
    }
    return applyEvent(request, reply, "claim", { assigneeId: request.user.sub });
  });

  app.post("/api/tickets/:id/dispatch", async (request, reply) => {
    if (request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有管理员可以派单" });
    }
    const assigneeId = Number((request.body as { assigneeId?: number }).assigneeId);
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || (assignee.role !== "agent" && assignee.role !== "admin")) {
      return reply.code(400).send({ message: "请选择客服席位" });
    }
    return applyEvent(request, reply, "dispatch", { assigneeId }, { assigneeId });
  });

  app.post("/api/tickets/:id/draft", async (request, reply) => {
    if (request.user.role !== "agent" && request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有客服可以写草稿" });
    }
    const content = ((request.body as { content?: string }).content ?? "").trim();
    if (content.length < 2) {
      return reply.code(400).send({ message: "请先写下回复草稿" });
    }

    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.ticket.findFirst({
      where: { id, ...ticketWhere(request.user) },
    });
    if (!existing) {
      return reply.code(404).send({ message: "工单不存在" });
    }

    try {
      const expectedVersion = readVersion(request.body);
      const status = transition(existing.status, "save_draft");
      await applyTicketChange({
        id,
        expectedVersion,
        actorId: request.user.sub,
        action: "save_draft",
        fromStatus: existing.status,
        toStatus: status,
        data: { status },
        work: async (tx) => {
          const latestDraft = await tx.ticketReply.findFirst({
            where: { ticketId: id, source: { in: ["draft", "ai", "llm", "rules"] } },
            orderBy: { createdAt: "desc" },
          });
          if (latestDraft) {
            await tx.ticketReply.update({ where: { id: latestDraft.id }, data: { content } });
          } else {
            await tx.ticketReply.create({ data: { ticketId: id, content, source: "draft" } });
          }
        },
      });
      const ticket = await loadAfterWrite(id, request.user);
      return { ticket };
    } catch (error) {
      return sendError(reply, error, "无法保存草稿");
    }
  });

  app.post("/api/tickets/:id/confirm", async (request, reply) => {
    if (request.user.role !== "agent" && request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有客服可以确认发送" });
    }
    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.ticket.findFirst({
      where: { id, ...ticketWhere(request.user) },
    });
    if (!existing) {
      return reply.code(404).send({ message: "工单不存在" });
    }

    try {
      const expectedVersion = readVersion(request.body);
      const status = transition(existing.status, "confirm_reply");
      const body = ((request.body as { content?: string }).content ?? "").trim();
      await applyTicketChange({
        id,
        expectedVersion,
        actorId: request.user.sub,
        action: "confirm_reply",
        fromStatus: existing.status,
        toStatus: status,
        data: {
          status,
          assigneeId: existing.assigneeId ?? request.user.sub,
        },
        detail: { edited: Boolean(body) },
        work: async (tx) => {
          const draft = await tx.ticketReply.findFirst({
            where: { ticketId: id, source: { in: ["draft", "ai", "llm", "rules"] } },
            orderBy: { createdAt: "desc" },
          });
          if (!draft) {
            throw new HttpError(400, "还没有回复草稿");
          }
          await tx.ticketReply.update({
            where: { id: draft.id },
            data: { source: "human", content: body || draft.content },
          });
        },
      });
      const ticket = await loadAfterWrite(id, request.user);
      return { ticket };
    } catch (error) {
      return sendError(reply, error, "无法确认发送");
    }
  });

  app.post("/api/tickets/:id/agent", async (request, reply) => {
    if (request.user.role !== "agent" && request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有客服可以重跑 Agent" });
    }
    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.ticket.findFirst({
      where: { id, ...ticketWhere(request.user) },
    });
    if (!existing) {
      return reply.code(404).send({ message: "工单不存在" });
    }
    try {
      await runTicketAgent(id, {
        actorId: request.user.sub,
        expectedVersion: readVersion(request.body),
      });
      const ticket = await loadAfterWrite(id, request.user);
      return { ticket };
    } catch (error) {
      return sendError(reply, error, "Agent 执行失败");
    }
  });

  app.post("/api/tickets/:id/category", async (request, reply) => {
    if (request.user.role !== "agent" && request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有客服可以改分类" });
    }
    const category = ((request.body as { category?: string }).category ?? "").trim();
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return reply.code(400).send({ message: "分类不合法" });
    }
    const id = Number((request.params as { id: string }).id);
    const existing = await prisma.ticket.findFirst({
      where: { id, ...ticketWhere(request.user) },
    });
    if (!existing) {
      return reply.code(404).send({ message: "工单不存在" });
    }
    try {
      const status = transition(existing.status, "manual_classify");
      await applyTicketChange({
        id,
        expectedVersion: readVersion(request.body),
        actorId: request.user.sub,
        action: "manual_classify",
        fromStatus: existing.status,
        toStatus: status,
        data: { status, category },
        detail: { category },
      });
      const ticket = await loadAfterWrite(id, request.user);
      return { ticket };
    } catch (error) {
      return sendError(reply, error, "无法修正分类");
    }
  });

  app.post("/api/tickets/:id/reject", async (request, reply) => {
    if (request.user.role !== "agent" && request.user.role !== "admin") {
      return reply.code(403).send({ message: "只有客服可以驳回草稿" });
    }
    return applyEvent(request, reply, "reject_draft", rejectAssignment(request.user.sub));
  });

  app.post("/api/tickets/:id/cancel", async (request, reply) => {
    return applyEvent(request, reply, "cancel");
  });

  app.post("/api/tickets/:id/close", async (request, reply) => {
    return applyEvent(request, reply, "close");
  });
}

async function applyEvent(
  request: FastifyRequest,
  reply: FastifyReply,
  event: TicketEvent,
  extra: { assigneeId?: number } = {},
  detail: Prisma.InputJsonValue = {},
) {
  const id = Number((request.params as { id: string }).id);
  const existing = await prisma.ticket.findFirst({
    where: { id, ...ticketWhere(request.user) },
  });
  if (!existing) {
    return reply.code(404).send({ message: "工单不存在" });
  }

  try {
    const status = transition(existing.status, event);
    await applyTicketChange({
      id,
      expectedVersion: readVersion(request.body),
      actorId: request.user.sub,
      action: event,
      fromStatus: existing.status,
      toStatus: status,
      data: { status, ...extra },
      detail,
    });
    const ticket = await loadAfterWrite(id, request.user);
    return { ticket };
  } catch (error) {
    return sendError(reply, error, "状态不能这样转");
  }
}
