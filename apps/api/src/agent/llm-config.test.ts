import assert from "node:assert/strict";
import test from "node:test";
import { resolveLlmConfig } from "./llm-config.js";

test("binds each provider key to its own default endpoint and model", () => {
  assert.deepEqual(resolveLlmConfig({ DEEPSEEK_API_KEY: "deepseek-secret" }), {
    provider: "deepseek", apiKey: "deepseek-secret", baseURL: "https://api.deepseek.com", model: "deepseek-chat",
  });
  assert.deepEqual(resolveLlmConfig({ OPENAI_API_KEY: "openai-secret" }), {
    provider: "openai", apiKey: "openai-secret", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini",
  });
});

test("rejects ambiguous keys and cross-provider endpoints before a request", () => {
  assert.throws(() => resolveLlmConfig({ DEEPSEEK_API_KEY: "a", OPENAI_API_KEY: "b" }), /LLM_PROVIDER/);
  assert.throws(
    () => resolveLlmConfig({ OPENAI_API_KEY: "b", LLM_BASE_URL: "https://api.deepseek.com" }),
    /Endpoint does not match openai/,
  );
  assert.throws(
    () => resolveLlmConfig({ DEEPSEEK_API_KEY: "a", LLM_BASE_URL: "http://api.deepseek.com" }),
    /must use HTTPS/,
  );
});
