import { prisma } from "../lib/prisma.js";
import { retrieveKnowledge } from "../lib/knowledge.js";
import { transition } from "../lib/ticket-state.js";
import { applyTicketChange, HttpError } from "../lib/ticket-lock.js";
import { classifyTicket, draftTicket } from "./tools.js";

const CONFIDENCE_THRESHOLD = 0.7;

async function trace(params: {
  ticketId: number;
  toolName: string;
  input: object;
  output: object;
  confidence?: number;
  startedAt: number;
}) {
  await prisma.agentTrace.create({
    data: {
      ticketId: params.ticketId,
      toolName: params.toolName,
      input: params.input,
      output: params.output,
      confidence: params.confidence,
      durationMs: Date.now() - params.startedAt,
    },
  });
}

export async function runTicketAgent(
  ticketId: number,
  ctx: { actorId: number; expectedVersion: number },
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new HttpError(404, "工单不存在");
  }
  if (ticket.version !== ctx.expectedVersion) {
    throw new HttpError(409, "这张单已被其他人改过，请刷新后再操作");
  }

  const classifyStarted = Date.now();
  const classified = await classifyTicket(ticket.title, ticket.content);
  await trace({
    ticketId,
    toolName: "classify",
    input: { title: ticket.title, content: ticket.content },
    output: classified,
    confidence: classified.confidence,
    startedAt: classifyStarted,
  });

  if (classified.confidence < CONFIDENCE_THRESHOLD) {
    const status = transition(ticket.status, "agent_fail");
    await applyTicketChange({
      id: ticketId,
      expectedVersion: ctx.expectedVersion,
      actorId: ctx.actorId,
      action: "agent_fail",
      fromStatus: ticket.status,
      toStatus: status,
      data: { status, category: classified.category },
      detail: { category: classified.category, confidence: classified.confidence },
    });
    return { status, classified };
  }

  const retrieveStarted = Date.now();
  const hits = await retrieveKnowledge(`${ticket.title}\n${ticket.content}`, 3);
  await trace({
    ticketId,
    toolName: "retrieve",
    input: { query: `${ticket.title} ${ticket.content}`.slice(0, 200) },
    output: {
      count: hits.length,
      titles: hits.map((hit) => hit.title),
    },
    confidence: hits[0] ? Math.min(1, hits[0].score / 10) : 0,
    startedAt: retrieveStarted,
  });

  const draftStarted = Date.now();
  const drafted = await draftTicket(ticket.title, ticket.content, classified.category, hits);
  await trace({
    ticketId,
    toolName: "draft_reply",
    input: { category: classified.category, citations: hits.map((hit) => hit.title) },
    output: drafted,
    startedAt: draftStarted,
  });

  const status = transition(ticket.status, "agent_ok");
  await applyTicketChange({
    id: ticketId,
    expectedVersion: ctx.expectedVersion,
    actorId: ctx.actorId,
    action: "agent_ok",
    fromStatus: ticket.status,
    toStatus: status,
    data: { status, category: classified.category },
    detail: { category: classified.category, citations: hits.map((hit) => hit.title) },
    work: async (tx) => {
      const existingDraft = await tx.ticketReply.findFirst({
        where: { ticketId, source: { in: ["draft", "ai"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existingDraft) {
        await tx.ticketReply.update({
          where: { id: existingDraft.id },
          data: { content: drafted.draft, source: "ai" },
        });
      } else {
        await tx.ticketReply.create({
          data: { ticketId, content: drafted.draft, source: "ai" },
        });
      }
    },
  });

  return { status, classified, drafted };
}
