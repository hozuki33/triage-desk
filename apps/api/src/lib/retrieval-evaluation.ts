import { retrieveKnowledge, type KnowledgeHit } from "./knowledge.js";

export const RETRIEVAL_CASES = [
  { query: "退款七个工作日还没到账怎么办", expectedTitle: "退款时效说明" },
  { query: "银行卡退款为什么延迟", expectedTitle: "退款时效说明" },
  { query: "物流五天没有更新", expectedTitle: "物流延误处理规范" },
  { query: "包裹超过承诺时间怎么催派", expectedTitle: "物流延误处理规范" },
  { query: "账号验证码一直收不到", expectedTitle: null },
  { query: "怎么修改头像", expectedTitle: null },
] as const;

export type RetrievalEvaluation = {
  total: number;
  passed: number;
  accuracy: number;
  relevantTop1Accuracy: number;
  rejectionAccuracy: number;
  cases: Array<{
    query: string;
    expectedTitle: string | null;
    actualTitle: string | null;
    passed: boolean;
    score: number | null;
  }>;
};

export async function evaluateRetrieval(
  retrieve: (query: string, k: number) => Promise<KnowledgeHit[]> = retrieveKnowledge,
): Promise<RetrievalEvaluation> {
  const cases = [];
  for (const item of RETRIEVAL_CASES) {
    const [hit] = await retrieve(item.query, 1);
    const actualTitle = hit?.title ?? null;
    cases.push({
      query: item.query,
      expectedTitle: item.expectedTitle,
      actualTitle,
      passed: actualTitle === item.expectedTitle,
      score: hit ? Number(hit.score.toFixed(2)) : null,
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
    rejectionAccuracy: rejected.filter((item) => item.passed).length / rejected.length,
    cases,
  };
}
