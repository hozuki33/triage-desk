import { prisma } from "../lib/prisma.js";
import { retrieveKnowledgeWithMetadata } from "../lib/knowledge.js";
import { transition } from "../lib/ticket-state.js";
import { applyTicketChange, HttpError } from "../lib/ticket-lock.js";
import { classifyTicket, draftTicket } from "./tools.js";
import { replySourceForProvider } from "./execution.js";

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
    input: { titleLength: ticket.title.length, contentLength: ticket.content.length },
    output: { category: classified.category, confidence: classified.confidence, provider: classified.provider, executionStatus: classified.executionStatus, fallbackCode: classified.fallbackCode },
    confidence: classified.confidence,
    startedAt: classifyStarted,
  });

  if (classified.executionStatus === "degraded" || classified.confidence < CONFIDENCE_THRESHOLD) {
    const status = transition(ticket.status, "agent_fail");
    await applyTicketChange({
      id: ticketId,
      expectedVersion: ctx.expectedVersion,
      actorId: ctx.actorId,
      action: "agent_fail",
      fromStatus: ticket.status,
      toStatus: status,
      data: { status, category: classified.category },
      detail: { category: classified.category, confidence: classified.confidence, provider: classified.provider, executionStatus: classified.executionStatus, fallbackCode: classified.fallbackCode },
    });
    return { status, classified };
  }

  const retrieveStarted = Date.now();
  const retrieval = await retrieveKnowledgeWithMetadata(`${ticket.title}\n${ticket.content}`, 3, classified.category);
  const hits = retrieval.hits;
  await trace({
    ticketId,
    toolName: "retrieve",
    input: { queryLength: ticket.title.length + ticket.content.length + 1, limit: 3 },
    output: {
      count: hits.length,
      titles: hits.map((hit) => hit.title),
      mode: retrieval.mode,
      vectorStatus: retrieval.vectorStatus,
      durationMs: retrieval.durationMs,
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
    output: { provider: drafted.provider, executionStatus: drafted.executionStatus, fallbackCode: drafted.fallbackCode, characterCount: drafted.draft.length },
    startedAt: draftStarted,
  });

  if (drafted.executionStatus === "degraded") {
    const status = transition(ticket.status, "agent_fail");
    await applyTicketChange({
      id: ticketId,
      expectedVersion: ctx.expectedVersion,
      actorId: ctx.actorId,
      action: "agent_fail",
      fromStatus: ticket.status,
      toStatus: status,
      data: { status, category: classified.category },
      detail: { stage: "draft_reply", provider: drafted.provider, executionStatus: drafted.executionStatus, fallbackCode: drafted.fallbackCode },
    });
    return { status, classified, drafted };
  }

  const status = transition(ticket.status, "agent_ok");
  await applyTicketChange({
    id: ticketId,
    expectedVersion: ctx.expectedVersion,
    actorId: ctx.actorId,
    action: "agent_ok",
    fromStatus: ticket.status,
    toStatus: status,
    data: { status, category: classified.category },
    detail: { category: classified.category, citations: hits.map((hit) => hit.title), provider: drafted.provider, executionStatus: drafted.executionStatus },
    work: async (tx) => {
      const existingDraft = await tx.ticketReply.findFirst({
        where: { ticketId, source: { in: ["draft", "ai", "llm", "rules"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existingDraft) {
        await tx.ticketReply.update({
          where: { id: existingDraft.id },
          data: { content: drafted.draft, source: replySourceForProvider(drafted.provider) },
        });
      } else {
        await tx.ticketReply.create({
          data: { ticketId, content: drafted.draft, source: replySourceForProvider(drafted.provider) },
        });
      }
    },
  });

  return { status, classified, drafted };
}
