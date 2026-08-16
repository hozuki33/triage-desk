import { createLocalEmbeddingProvider } from "../src/rag/embedding.js";

function cosine(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

const provider = createLocalEmbeddingProvider();
const query = await provider.embedQuery("钱一直没有退回银行卡");
const [refund, logistics] = await provider.embedDocuments([
  "银行卡退款一般需要三个工作日到账，最迟可延迟一至两天。",
  "物流超过五天没有更新时可以申请催派。",
]);
if (!refund || !logistics) throw new Error("Embedding smoke test did not return all vectors");

console.log(JSON.stringify({
  ok: true,
  provider: provider.metadata.provider,
  model: provider.metadata.model,
  dimensions: query.length,
  similarities: {
    refund: Number(cosine(query, refund).toFixed(4)),
    logistics: Number(cosine(query, logistics).toFixed(4)),
  },
}));
