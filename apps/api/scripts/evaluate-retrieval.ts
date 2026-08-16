import { evaluateRetrievalSuite } from "../src/lib/retrieval-evaluation.js";

const result = await evaluateRetrievalSuite();
console.log(JSON.stringify(result, null, 2));
if (result.modes.hybrid.accuracy < 0.9 || result.modes.hybrid.accuracy < result.modes.lexical.accuracy) {
  process.exitCode = 1;
}
