import assert from "node:assert/strict";
import test from "node:test";
import {
  EMBEDDING_DIMENSIONS,
  embeddingConfigurationStatus,
  getEmbeddingProvider,
} from "./embedding.js";

test("local embedding is the default and advertises the database dimension", () => {
  const provider = getEmbeddingProvider({});
  assert.equal(provider?.metadata.provider, "local_transformers");
  assert.equal(provider?.metadata.dimensions, EMBEDDING_DIMENSIONS);
});

test("embedding can be explicitly disabled for lexical fallback", () => {
  assert.equal(getEmbeddingProvider({ EMBEDDING_PROVIDER: "disabled" }), null);
  assert.equal(embeddingConfigurationStatus({ EMBEDDING_PROVIDER: "disabled" }), "disabled");
});

test("unknown embedding providers fail closed", () => {
  assert.throws(() => getEmbeddingProvider({ EMBEDDING_PROVIDER: "unknown" }), /不支持/);
  assert.equal(embeddingConfigurationStatus({ EMBEDDING_PROVIDER: "unknown" }), "misconfigured");
});
