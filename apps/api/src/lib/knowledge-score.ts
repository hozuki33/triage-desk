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
  "退款", "退货", "到账", "订单号", "物流", "快递", "发货", "配送", "签收", "催派",
  "质量", "破损", "假货", "盗号", "密码", "验证码", "扣费", "支付", "账单",
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

export function hybridScore(query: string, haystack: string, trigramScore: number): number {
  return keywordScore(query, haystack) + Math.max(0, Math.min(1, trigramScore)) * 10;
}

export function isRelevantKnowledge(query: string, haystack: string, trigramScore: number): boolean {
  return keywordScore(query, haystack) > 0 || trigramScore >= 0.12;
}
