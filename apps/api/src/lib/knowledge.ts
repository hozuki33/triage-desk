import { prisma } from "./prisma.js";

export type KnowledgeHit = {
  docId: number;
  title: string;
  content: string;
  score: number;
};

const CHUNK_SIZE = 420;
const CHUNK_OVERLAP = 80;

export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= size) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + size);
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

const DOMAIN_TERMS = [
  "退款",
  "退货",
  "到账",
  "订单号",
  "物流",
  "快递",
  "发货",
  "配送",
  "签收",
  "催派",
  "质量",
  "破损",
  "假货",
  "盗号",
  "密码",
  "验证码",
  "扣费",
  "支付",
  "账单",
];

function tokens(text: string): string[] {
  const parts = text
    .toLowerCase()
    .split(/[\s,，。！？、；：:.\n/\\()（）【】[\]「」""]+/)
    .filter((item) => item.length >= 2);
  const terms = DOMAIN_TERMS.filter((term) => text.includes(term));
  return [...new Set([...terms, ...parts])];
}

export function keywordScore(query: string, haystack: string): number {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return 0;
  const hay = haystack.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (!hay.includes(token)) continue;
    score += DOMAIN_TERMS.includes(token) ? 4 : token.length >= 4 ? 3 : 2;
  }
  return score;
}

export async function retrieveKnowledge(query: string, k = 3): Promise<KnowledgeHit[]> {
  const chunks = await prisma.knowledgeChunk.findMany({
    include: { doc: { select: { id: true, title: true } } },
  });
  const ranked = chunks
    .map((chunk) => ({
      docId: chunk.doc.id,
      title: chunk.doc.title,
      content: chunk.content,
      score: keywordScore(query, `${chunk.doc.title}\n${chunk.content}`),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  return ranked.filter((item) => item.score >= Math.max(3, top * 0.6)).slice(0, k);
}

export async function indexDocument(docId: number) {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) throw new Error("文档不存在");

  const chunks = chunkText(doc.content);
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { docId } }),
    ...chunks.map((content, ordinal) =>
      prisma.knowledgeChunk.create({
        data: { docId, ordinal, content },
      }),
    ),
    prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { status: "ready", chunkCount: chunks.length },
    }),
  ]);
  return chunks.length;
}
