import { evaluateRetrieval } from "../src/lib/retrieval-evaluation.js";

const result = await evaluateRetrieval();
console.log(JSON.stringify(result, null, 2));
if (result.accuracy < 1) process.exitCode = 1;
