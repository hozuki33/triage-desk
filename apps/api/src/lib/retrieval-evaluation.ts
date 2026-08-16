import {
  retrieveKnowledge,
  retrieveKnowledgeByStrategy,
  type KnowledgeHit,
  type RetrievalStrategy,
} from "./knowledge.js";
import type { TicketCategory } from "./categories.js";

export const RETRIEVAL_CASES = [
  { query: "退款七个工作日还没到账怎么办", expectedTitle: "退款时效说明", category: "refund_issue" },
  { query: "银行卡退款为什么延迟", expectedTitle: "退款时效说明", category: "refund_issue" },
  { query: "钱一直没有退回银行卡", expectedTitle: "退款时效说明", category: "refund_issue" },
  { query: "退回款项迟迟没收到", expectedTitle: "退款时效说明", category: "refund_issue" },
  { query: "物流五天没有更新", expectedTitle: "物流延误处理规范", category: "delivery_delay" },
  { query: "包裹超过承诺时间怎么催派", expectedTitle: "物流延误处理规范", category: "delivery_delay" },
  { query: "快件停在同一个地方好几天了", expectedTitle: "物流延误处理规范", category: "delivery_delay" },
  { query: "我的货一直在路上没有动静", expectedTitle: "物流延误处理规范", category: "delivery_delay" },
  { query: "账号验证码一直收不到", expectedTitle: null, category: "account_security" },
  { query: "怎么修改头像", expectedTitle: null, category: "other" },
  { query: "会员怎么取消自动续费", expectedTitle: null, category: "billing_payment" },
  { query: "在哪里开电子发票", expectedTitle: null, category: "billing_payment" },
] as const satisfies ReadonlyArray<{ query: string; expectedTitle: string | null; category: TicketCategory }>;

export type RetrievalEvaluation = {
  total: number;
  passed: number;
  accuracy: number;
  relevantTop1Accuracy: number;
  hitAt3: number;
  meanReciprocalRank: number;
  rejectionAccuracy: number;
  averageLatencyMs: number;
  cases: Array<{
    query: string;
    expectedTitle: string | null;
    actualTitle: string | null;
    top3Titles: string[];
    passed: boolean;
    hitAt3: boolean;
    reciprocalRank: number;
    score: number | null;
    latencyMs: number;
  }>;
};

export type RetrievalEvaluationSuite = {
  generatedAt: string;
  modes: Record<RetrievalStrategy, RetrievalEvaluation>;
};

export async function evaluateRetrieval(
  retrieve: (query: string, k: number, category?: TicketCategory) => Promise<KnowledgeHit[]> = retrieveKnowledge,
): Promise<RetrievalEvaluation> {
  const cases: RetrievalEvaluation["cases"] = [];
  for (const item of RETRIEVAL_CASES) {
    const startedAt = performance.now();
    const hits = await retrieve(item.query, 3, item.category);
    const latencyMs = performance.now() - startedAt;
    const actualTitle = hits[0]?.title ?? null;
    const expectedRank = item.expectedTitle
      ? hits.findIndex((hit) => hit.title === item.expectedTitle) + 1
      : 0;
    const rejected = item.expectedTitle === null && hits.length === 0;
    cases.push({
      query: item.query,
      expectedTitle: item.expectedTitle,
      actualTitle,
      top3Titles: hits.map((hit) => hit.title),
      passed: item.expectedTitle === null ? rejected : actualTitle === item.expectedTitle,
      hitAt3: item.expectedTitle === null ? rejected : expectedRank > 0,
      reciprocalRank: expectedRank > 0 ? 1 / expectedRank : 0,
      score: hits[0] ? Number(hits[0].score.toFixed(2)) : null,
      latencyMs: Number(latencyMs.toFixed(1)),
    });
  }
  const relevant = cases.filter((item) => item.expectedTitle !== null);
  const rejected = cases.filter((item) => item.expectedTitle === null);
  const passed = cases.filter((item) => item.passed).length;
  return {
    total: cases.length,
    passed,
    accuracy: passed / cases.length,
    relevantTop1Accuracy: relevant.filter((item) => item.passed).length / relevant.length,
    hitAt3: relevant.filter((item) => item.hitAt3).length / relevant.length,
    meanReciprocalRank: relevant.reduce((sum, item) => sum + item.reciprocalRank, 0) / relevant.length,
    rejectionAccuracy: rejected.filter((item) => item.passed).length / rejected.length,
    averageLatencyMs: cases.reduce((sum, item) => sum + item.latencyMs, 0) / cases.length,
    cases,
  };
}

export async function evaluateRetrievalSuite(): Promise<RetrievalEvaluationSuite> {
  const modes = {} as Record<RetrievalStrategy, RetrievalEvaluation>;
  for (const strategy of ["lexical", "vector", "hybrid"] as const) {
    modes[strategy] = await evaluateRetrieval(async (query, k, category) =>
      (await retrieveKnowledgeByStrategy(query, k, strategy, category)).hits,
    );
  }
  return { generatedAt: new Date().toISOString(), modes };
}
