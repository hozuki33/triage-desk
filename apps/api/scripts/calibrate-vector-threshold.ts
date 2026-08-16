import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { RETRIEVAL_CASES } from "../src/lib/retrieval-evaluation.js";
import { getEmbeddingProvider } from "../src/rag/embedding.js";

const provider = getEmbeddingProvider();
if (!provider) throw new Error("Embedding provider is disabled");

const cases = [];
try {
  for (const item of RETRIEVAL_CASES) {
    const vector = await provider.embedQuery(item.query);
    const literal = `[${vector.join(",")}]`;
    const scores = await prisma.$queryRaw<Array<{ title: string; score: number }>>(Prisma.sql`
      SELECT d.title, MAX(1 - (c.embedding <=> ${literal}::vector))::float8 AS score
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDoc" d ON d.id = c."docId"
      WHERE c.embedding IS NOT NULL
      GROUP BY d.id, d.title
      ORDER BY score DESC
    `);
    cases.push({
      query: item.query,
      expectedTitle: item.expectedTitle,
      scores: scores.map((row) => ({ title: row.title, score: Number(row.score.toFixed(4)) })),
    });
  }
  console.log(JSON.stringify({ model: provider.metadata.model, cases }, null, 2));
} finally {
  await prisma.$disconnect();
}
