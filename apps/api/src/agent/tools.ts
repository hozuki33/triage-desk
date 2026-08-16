import type { TicketCategory } from "../lib/categories.js";
import { CATEGORIES, categoryLabel } from "../lib/categories.js";
import type { KnowledgeHit } from "../lib/knowledge.js";
import {
  LLM_STRUCTURED_OUTPUT_METHOD,
  normalizeDraftText,
  runProvider,
  type ProviderMetadata,
} from "./execution.js";
import { hasAnyLlmKey, llmModelKwargs, resolveLlmConfig } from "./llm-config.js";

type ClassifyCore = {
  category: TicketCategory;
  confidence: number;
  reason: string;
};
export type ClassifyResult = ClassifyCore & ProviderMetadata;

type DraftCore = {
  draft: string;
};
export type DraftResult = DraftCore & ProviderMetadata;

function classifyByRules(title: string, content: string): ClassifyCore {
  const text = `${title}\n${content}`;
  const rules: Array<{ category: TicketCategory; pattern: RegExp; confidence: number; reason: string }> = [
    { category: "refund_issue", pattern: /退款|退钱|没到账|退货/, confidence: 0.88, reason: "出现退款/到账相关表述" },
    { category: "delivery_delay", pattern: /物流|快递|没收到|发货|配送/, confidence: 0.86, reason: "出现物流/收货相关表述" },
    { category: "product_quality", pattern: /质量|坏了|破损|假货/, confidence: 0.84, reason: "出现质量问题表述" },
    { category: "account_security", pattern: /盗号|密码|验证码|登录不了/, confidence: 0.85, reason: "出现账号安全表述" },
    { category: "billing_payment", pattern: /扣费|支付|账单|多扣/, confidence: 0.84, reason: "出现支付/账单表述" },
    { category: "feature_request", pattern: /希望|建议|增加功能|能不能/, confidence: 0.62, reason: "更像需求而不是故障" },
  ];
  const hit = rules.find((rule) => rule.pattern.test(text));
  if (!hit) {
    return { category: "other", confidence: 0.42, reason: "没有明确类别关键词" };
  }
  return { category: hit.category, confidence: hit.confidence, reason: hit.reason };
}

function formatCitations(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .map(
      (hit, index) =>
        `【${index + 1}《${hit.title}》】${hit.content.replace(/\s+/g, " ").slice(0, 120)}${hit.content.length > 120 ? "…" : ""}`,
    )
    .join("\n");
}

function draftByRules(title: string, content: string, category: TicketCategory, hits: KnowledgeHit[]): DraftCore {
  const label = categoryLabel[category];
  const citations = formatCitations(hits);
  const policy = citations
    ? `根据知识库：\n${citations}\n\n请按上述条文核对您的订单后处理。`
    : `我们会按该类问题的常规流程处理：先核对您描述的情况（${content.slice(0, 40)}…），再给出解决方案。`;
  return {
    draft: `您好，已收到关于「${title}」的工单（分类：${label}）。\n\n${policy}\n\n如信息有出入，请补充订单号或截图。`,
  };
}

async function classifyByLlm(title: string, content: string): Promise<ClassifyCore> {
  const { ChatOpenAI } = await import("@langchain/openai");
  const { z } = await import("zod");
  const config = resolveLlmConfig();
  if (!config) throw new Error("LLM is not configured");
  const llm = new ChatOpenAI({
    model: config.model,
    temperature: 0,
    apiKey: config.apiKey,
    configuration: {
      baseURL: config.baseURL,
    },
    modelKwargs: llmModelKwargs(config.provider),
  });
  const schema = z.object({
    category: z.enum(CATEGORIES),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  });
  const result = await llm.withStructuredOutput(schema, { method: LLM_STRUCTURED_OUTPUT_METHOD }).invoke([
    {
      role: "system",
      content:
        "你是工单分类助手。类别：refund_issue, delivery_delay, product_quality, account_security, billing_payment, feature_request, other。内容模糊时 confidence 给 0.3-0.5。",
    },
    { role: "user", content: `标题：${title}\n内容：${content}` },
  ]);
  return result;
}

async function draftByLlm(
  title: string,
  content: string,
  category: TicketCategory,
  hits: KnowledgeHit[],
): Promise<DraftCore> {
  const { ChatOpenAI } = await import("@langchain/openai");
  const config = resolveLlmConfig();
  if (!config) throw new Error("LLM is not configured");
  const llm = new ChatOpenAI({
    model: config.model,
    temperature: 0.3,
    apiKey: config.apiKey,
    configuration: {
      baseURL: config.baseURL,
    },
    modelKwargs: llmModelKwargs(config.provider),
  });
  const knowledge = formatCitations(hits) || "（知识库暂无匹配片段，不要编造政策。）";
  const result = await llm.invoke([
    {
      role: "system",
      content: "Output plain text only. Do not use Markdown headings, bold, underscores, lists, or code fences.",
    },
    {
      role: "system",
      content:
        "你是客服回复助手。根据工单和知识库片段起草 150-250 字的友善回复。只引用给定片段，不要编造政策细节。回复里用《文档名》标出处。只输出回复正文。",
    },
    {
      role: "user",
      content: `分类：${categoryLabel[category]}\n标题：${title}\n内容：${content}\n知识库：\n${knowledge}`,
    },
  ]);
  const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  return { draft: normalizeDraftText(text) };
}

export async function classifyTicket(title: string, content: string): Promise<ClassifyResult> {
  return runProvider({ configured: hasAnyLlmKey(), invoke: () => classifyByLlm(title, content), fallback: () => classifyByRules(title, content) });
}

export async function draftTicket(
  title: string,
  content: string,
  category: TicketCategory,
  hits: KnowledgeHit[] = [],
): Promise<DraftResult> {
  return runProvider({ configured: hasAnyLlmKey(), invoke: () => draftByLlm(title, content, category, hits), fallback: () => draftByRules(title, content, category, hits) });
}
