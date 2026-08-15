import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProviderError,
  LLM_STRUCTURED_OUTPUT_METHOD,
  normalizeDraftText,
  replySourceForProvider,
  runProvider,
} from "./execution.js";

test("uses the provider-compatible structured output method", () => {
  assert.equal(LLM_STRUCTURED_OUTPUT_METHOD, "functionCalling");
});

test("maps draft provider to an honest reply source", () => {
  assert.equal(replySourceForProvider("llm"), "llm");
  assert.equal(replySourceForProvider("rules"), "rules");
});

test("normalizes lightweight Markdown from plain-text drafts", () => {
  assert.equal(normalizeDraftText("## 处理方案\n请选择**补发**或__退款__。"), "处理方案\n请选择补发或退款。");
});

test("uses rules without calling the provider when no key is configured", async () => {
  let called = false;
  const result = await runProvider({
    configured: false,
    invoke: async () => {
      called = true;
      return { value: "remote" };
    },
    fallback: () => ({ value: "local" }),
  });

  assert.equal(called, false);
  assert.deepEqual(result, {
    value: "local",
    provider: "rules",
    executionStatus: "disabled",
  });
});

test("marks a configured successful provider call as llm", async () => {
  const result = await runProvider({
    configured: true,
    invoke: async () => ({ value: "remote" }),
    fallback: () => ({ value: "local" }),
  });

  assert.deepEqual(result, {
    value: "remote",
    provider: "llm",
    executionStatus: "ok",
  });
});

test("returns a sanitized degraded result when the provider rejects", async () => {
  const secretBearingError = Object.assign(new Error("request used secret-token"), { status: 401 });
  const result = await runProvider({
    configured: true,
    invoke: async () => {
      throw secretBearingError;
    },
    fallback: () => ({ value: "local" }),
  });

  assert.deepEqual(result, {
    value: "local",
    provider: "rules",
    executionStatus: "degraded",
    fallbackCode: "authentication",
  });
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("classifies provider errors without persisting their messages", () => {
  assert.equal(classifyProviderError({ statusCode: 429 }), "rate_limit");
  assert.equal(classifyProviderError(new DOMException("stopped", "AbortError")), "timeout");
  assert.equal(classifyProviderError(new Error("socket closed")), "provider_error");
});
