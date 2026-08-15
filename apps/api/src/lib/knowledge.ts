import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { chunkText, hybridScore, isRelevantKnowledge } from "./knowledge-score.js";
import { ensureSearchInfrastructure } from "./search-infrastructure.js";

export { chunkText, keywordScore } from "./knowledge-score.js";

export type KnowledgeHit = {
  docId: number;
  title: string;
  content: string;
  score: number;
};

export async function retrieveKnowledge(query: string, k = 3): Promise<KnowledgeHit[]> {
  await ensureSearchInfrastructure();
  const candidateLimit = Math.max(20, k * 10);
  const candidates = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', '0.01', true)`;
    return tx.$queryRaw<Array<KnowledgeHit & { trigramScore: number }>>(Prisma.sql`
      SELECT
        d.id AS "docId",
        d.title,
        c.content,
        GREATEST(
          similarity(lower(c.content), lower(${query})),
          similarity(lower(d.title), lower(${query}))
        )::float8 AS "trigramScore",
        0::float8 AS score
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDoc" d ON d.id = c."docId"
      WHERE lower(c.content) % lower(${query})
         OR lower(d.title) % lower(${query})
      ORDER BY "trigramScore" DESC
      LIMIT ${candidateLimit}
    `);
  });
  const ranked = candidates
    .filter((item) => isRelevantKnowledge(query, `${item.title}\n${item.content}`, item.trigramScore))
    .map((item) => ({
      docId: item.docId,
      title: item.title,
      content: item.content,
      score: hybridScore(query, `${item.title}\n${item.content}`, item.trigramScore),
    }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  return ranked.filter((item) => item.score >= Math.max(2, top * 0.45)).slice(0, k);
}

export async function indexDocument(docId: number) {
  await ensureSearchInfrastructure();
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) throw new Error("文档不存在");

  const chunks = chunkText(doc.content);
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { docId } }),
    ...chunks.map((content, ordinal) =>
      prisma.knowledgeChunk.create({
        data: { docId, ordinal, content },
      }),
    ),
    prisma.knowledgeDoc.update({
      where: { id: docId },
      data: { status: "ready", chunkCount: chunks.length },
    }),
  ]);
  return chunks.length;
}
