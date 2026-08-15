import { classifyTicket, draftTicket } from "../src/agent/tools.js";
import { retrieveKnowledge } from "../src/lib/knowledge.js";
import { prisma } from "../src/lib/prisma.js";

const title = "快递五天没有更新";
const content = "订单 TD-LLM-CHECK 的物流五天没有更新，请问可以补发还是退款？";

try {
  const classification = await classifyTicket(title, content);
  const hits = await retrieveKnowledge(`${title}\n${content}`, 3);
  const draft = await draftTicket(title, content, classification.category, hits);
  const evidenceIncluded = hits.some((hit) => draft.draft.includes(hit.title));
  const actionGuidance = /补发|退款|催派|核实/.test(draft.draft);
  const plainText = !/\*\*|__|^#{1,6}\s/m.test(draft.draft);

  const result = {
    classification: {
      provider: classification.provider,
      executionStatus: classification.executionStatus,
      category: classification.category,
    },
    retrieval: {
      mode: "hybrid_pg_trgm",
      hitCount: hits.length,
      topTitle: hits[0]?.title ?? null,
    },
    draft: {
      provider: draft.provider,
      executionStatus: draft.executionStatus,
      length: draft.draft.length,
      evidenceIncluded,
      actionGuidance,
      plainText,
    },
  };
  console.log(JSON.stringify(result, null, 2));

  if (
    classification.provider !== "llm" ||
    classification.executionStatus !== "ok" ||
    draft.provider !== "llm" ||
    draft.executionStatus !== "ok" ||
    hits.length === 0 ||
    !evidenceIncluded ||
    !actionGuidance ||
    !plainText
  ) {
    throw new Error("Real LLM verification did not meet the acceptance criteria");
  }
} finally {
  await prisma.$disconnect();
}
