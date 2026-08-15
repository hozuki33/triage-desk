import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRetrieval } from "./retrieval-evaluation.js";

test("retrieval evaluation reports top-1 and rejection accuracy", async () => {
  const expected = new Map([
    ["退款七个工作日还没到账怎么办", "退款时效说明"],
    ["银行卡退款为什么延迟", "退款时效说明"],
    ["物流五天没有更新", "物流延误处理规范"],
    ["包裹超过承诺时间怎么催派", "物流延误处理规范"],
  ]);
  const result = await evaluateRetrieval(async (query) => {
    const title = expected.get(query);
    return title ? [{ docId: 1, title, content: "fixture", score: 8 }] : [];
  });

  assert.equal(result.total, 6);
  assert.equal(result.passed, 6);
  assert.equal(result.accuracy, 1);
  assert.equal(result.relevantTop1Accuracy, 1);
  assert.equal(result.rejectionAccuracy, 1);
});
