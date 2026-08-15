import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const tickets = await prisma.ticket.findMany({
  where: { status: "in_progress", assigneeId: null },
  select: { id: true, version: true },
});

let repaired = 0;
for (const ticket of tickets) {
  const rejection = await prisma.auditLog.findFirst({
    where: { ticketId: ticket.id, action: "reject_draft" },
    orderBy: { createdAt: "desc" },
    select: { actorId: true },
  });
  if (!rejection) continue;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.updateMany({
      where: { id: ticket.id, version: ticket.version, assigneeId: null, status: "in_progress" },
      data: { assigneeId: rejection.actorId, version: { increment: 1 } },
    });
    if (updated.count !== 1) return;
    await tx.auditLog.create({
      data: {
        ticketId: ticket.id,
        actorId: rejection.actorId,
        action: "repair_assignment",
        fromStatus: "in_progress",
        toStatus: "in_progress",
        detail: { reason: "rejected_ticket_was_unassigned" },
      },
    });
    repaired += 1;
  });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function safeOutput(toolName: string, value: unknown) {
  const source = objectValue(value);
  const common = {
    provider: source.provider,
    executionStatus: source.executionStatus,
    fallbackCode: source.fallbackCode,
  };
  if (toolName === "classify") {
    return compact({ category: source.category, confidence: source.confidence, ...common, legacyRedacted: true });
  }
  if (toolName === "retrieve") {
    return compact({
      count: source.count,
      titles: Array.isArray(source.titles) ? source.titles.filter((item) => typeof item === "string").slice(0, 10) : [],
      legacyRedacted: true,
    });
  }
  if (toolName === "draft_reply") {
    const draft = typeof source.draft === "string" ? source.draft : "";
    return compact({ ...common, characterCount: source.characterCount ?? draft.length, legacyRedacted: true });
  }
  return { legacyRedacted: true };
}

const traces = await prisma.agentTrace.findMany({ select: { id: true, toolName: true, input: true, output: true } });
let redactedTraces = 0;
for (const item of traces) {
  const input = objectValue(item.input);
  const output = objectValue(item.output);
  const containsLegacySensitiveFields = ["title", "content", "query"].some((key) => key in input)
    || ["reason", "draft"].some((key) => key in output);
  if (!containsLegacySensitiveFields) continue;
  await prisma.agentTrace.update({
    where: { id: item.id },
    data: { input: { legacyRedacted: true }, output: safeOutput(item.toolName, output) },
  });
  redactedTraces += 1;
}

await prisma.$disconnect();
console.log(`Repaired ${repaired} rejected ticket assignment(s).`);
console.log(`Redacted ${redactedTraces} legacy Agent trace(s).`);
