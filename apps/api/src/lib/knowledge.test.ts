import assert from "node:assert/strict";
import test from "node:test";
import { chunkText, hybridScore, isRelevantKnowledge, keywordScore } from "./knowledge-score.js";

test("domain terms carry more retrieval weight than generic words", () => {
  assert.ok(
    keywordScore("退款没到账", "退款通常在三个工作日内到账") >
      keywordScore("工作日", "退款通常在三个工作日内到账"),
  );
});

test("unrelated text has zero retrieval score", () => {
  assert.equal(keywordScore("如何修改密码", "物流签收后可以申请退款"), 0);
});

test("chunking preserves overlap between adjacent chunks", () => {
  const chunks = chunkText("abcdefghij", 6, 2);
  assert.deepEqual(chunks, ["abcdef", "efghij"]);
});

test("hybrid ranking combines domain evidence with database similarity", () => {
  const relevant = hybridScore("物流五天没更新", "物流超过 5 天无更新，可选择补发或退款", 0.3);
  const generic = hybridScore("物流五天没更新", "欢迎使用我们的服务", 0.35);
  assert.ok(relevant > generic);
});

test("relevance gate rejects weak unrelated candidates", () => {
  assert.equal(isRelevantKnowledge("修改头像", "物流延误处理规范", 0.05), false);
  assert.equal(isRelevantKnowledge("物流五天没更新", "物流延误处理规范", 0.05), true);
});
