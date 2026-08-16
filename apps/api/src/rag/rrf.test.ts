import assert from "node:assert/strict";
import test from "node:test";
import { reciprocalRankFusion } from "./rrf.js";

test("RRF rewards evidence present in both retrieval lists", () => {
  const scores = reciprocalRankFusion([
    [
      { key: "semantic-only", rank: 1, weight: 0.6 },
      { key: "shared", rank: 2, weight: 0.6 },
    ],
    [
      { key: "shared", rank: 1, weight: 0.4 },
      { key: "lexical-only", rank: 2, weight: 0.4 },
    ],
  ]);
  assert.ok((scores.get("shared") ?? 0) > (scores.get("semantic-only") ?? 0));
  assert.ok((scores.get("shared") ?? 0) > (scores.get("lexical-only") ?? 0));
});

test("RRF validates rank inputs", () => {
  assert.throws(() => reciprocalRankFusion([[{ key: "bad", rank: 0 }]]), /rank must start/);
});
