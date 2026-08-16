import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { chunkText, hybridScore, isRelevantKnowledge } from "./knowledge-score.js";
import { ensureSearchInfrastructure } from "./search-infrastructure.js";
import {
  EmbeddingError,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "../rag/embedding.js";
import { reciprocalRankFusion } from "../rag/rrf.js";

export { chunkText, keywordScore } from "./knowledge-score.js";

export type KnowledgeHit = {
  docId: number;
  title: string;
  content: string;
  score: number;
};

type RetrievalCandidate = KnowledgeHit & {
  chunkId: number;
  lexicalScore?: number;
  vectorScore?: number;
};

export type RetrievalStrategy = "hybrid" | "lexical" | "vector";
export type RetrievalMode = "hybrid" | "vector_only" | "lexical_fallback" | "lexical_only";
export type RetrievalResult = {
  hits: KnowledgeHit[];
  mode: RetrievalMode;
  vectorStatus: "ok" | "disabled" | "model_unavailable" | "provider_error" | "dimension_mismatch";
  durationMs: number;
};

const VECTOR_SCORE_FLOOR = Number(process.env.RAG_VECTOR_SCORE_FLOOR || "0.52");

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

async function retrieveLexical(query: string, candidateLimit: number, category?: string): Promise<RetrievalCandidate[]> {
  const candidates = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', '0.01', true)`;
    return tx.$queryRaw<Array<RetrievalCandidate & { trigramScore: number }>>(Prisma.sql`
      SELECT
        c.id AS "chunkId",
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
      WHERE (lower(c.content) % lower(${query})
         OR lower(d.title) % lower(${query}))
        ${category ? Prisma.sql`AND (d.category IS NULL OR d.category = ${category})` : Prisma.empty}
      ORDER BY "trigramScore" DESC
      LIMIT ${candidateLimit}
    `);
  });
  return candidates
    .filter((item) => isRelevantKnowledge(query, `${item.title}\n${item.content}`, item.trigramScore))
    .map((item) => ({
      ...item,
      lexicalScore: hybridScore(query, `${item.title}\n${item.content}`, item.trigramScore),
    }))
    .sort((a, b) => (b.lexicalScore ?? 0) - (a.lexicalScore ?? 0));
}

async function retrieveVector(vector: number[], candidateLimit: number, category?: string): Promise<RetrievalCandidate[]> {
  const literal = vectorLiteral(vector);
  const candidates = await prisma.$queryRaw<RetrievalCandidate[]>(Prisma.sql`
    SELECT
      c.id AS "chunkId",
      d.id AS "docId",
      d.title,
      c.content,
      (1 - (c.embedding <=> ${literal}::vector))::float8 AS "vectorScore",
      0::float8 AS score
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDoc" d ON d.id = c."docId"
    WHERE c.embedding IS NOT NULL
      ${category ? Prisma.sql`AND (d.category IS NULL OR d.category = ${category})` : Prisma.empty}
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${candidateLimit}
  `);
  return candidates.filter((item) => (item.vectorScore ?? 0) >= VECTOR_SCORE_FLOOR);
}

function topLexical(candidates: RetrievalCandidate[], k: number): KnowledgeHit[] {
  const top = candidates[0]?.lexicalScore ?? 0;
  return candidates
    .filter((item) => (item.lexicalScore ?? 0) >= Math.max(2, top * 0.45))
    .slice(0, k)
    .map((item) => ({
      docId: item.docId,
      title: item.title,
      content: item.content,
      score: item.lexicalScore ?? 0,
    }));
}

function fuseCandidates(lexical: RetrievalCandidate[], semantic: RetrievalCandidate[], k: number): KnowledgeHit[] {
  const scores = reciprocalRankFusion([
    semantic.map((item, index) => ({ key: String(item.chunkId), rank: index + 1, weight: 0.6 })),
    lexical.map((item, index) => ({ key: String(item.chunkId), rank: index + 1, weight: 0.4 })),
  ]);
  const candidates = new Map<number, RetrievalCandidate>();
  for (const item of [...semantic, ...lexical]) candidates.set(item.chunkId, item);
  const theoreticalBest = 1 / 61;
  return [...candidates.values()]
    .map((item) => ({
      ...item,
      score: ((scores.get(String(item.chunkId)) ?? 0) / theoreticalBest) * 10,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ docId, title, content, score }) => ({ docId, title, content, score }));
}

export async function retrieveKnowledgeWithMetadata(query: string, k = 3, category?: string): Promise<RetrievalResult> {
  return retrieveKnowledgeByStrategy(query, k, "hybrid", category);
}

export async function retrieveKnowledgeByStrategy(
  query: string,
  k = 3,
  strategy: RetrievalStrategy = "hybrid",
  category?: string,
): Promise<RetrievalResult> {
  const startedAt = Date.now();
  await ensureSearchInfrastructure();
  const candidateLimit = Math.max(20, k * 10);
  if (strategy === "lexical") {
    return {
      hits: topLexical(await retrieveLexical(query, candidateLimit, category), k),
      mode: "lexical_only",
      vectorStatus: "disabled",
      durationMs: Date.now() - startedAt,
    };
  }

  let provider: EmbeddingProvider | null;
  try {
    provider = getEmbeddingProvider();
  } catch (error) {
    const code = error instanceof EmbeddingError ? error.code : "provider_error";
    return {
      hits: strategy === "hybrid" ? topLexical(await retrieveLexical(query, candidateLimit, category), k) : [],
      mode: "lexical_fallback",
      vectorStatus: code,
      durationMs: Date.now() - startedAt,
    };
  }
  if (!provider) {
    return {
      hits: strategy === "hybrid" ? topLexical(await retrieveLexical(query, candidateLimit, category), k) : [],
      mode: "lexical_only",
      vectorStatus: "disabled",
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const vector = await provider.embedQuery(query);
    if (strategy === "vector") {
      const semantic = await retrieveVector(vector, candidateLimit, category);
      return {
        hits: semantic.slice(0, k).map((item) => ({
          docId: item.docId,
          title: item.title,
          content: item.content,
          score: (item.vectorScore ?? 0) * 10,
        })),
        mode: "vector_only",
        vectorStatus: "ok",
        durationMs: Date.now() - startedAt,
      };
    }
    const [lexical, semantic] = await Promise.all([
      retrieveLexical(query, candidateLimit, category),
      retrieveVector(vector, candidateLimit, category),
    ]);
    return {
      hits: fuseCandidates(lexical, semantic, k),
      mode: "hybrid",
      vectorStatus: "ok",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const code = error instanceof EmbeddingError ? error.code : "provider_error";
    return {
      hits: strategy === "hybrid" ? topLexical(await retrieveLexical(query, candidateLimit, category), k) : [],
      mode: "lexical_fallback",
      vectorStatus: code,
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function retrieveKnowledge(query: string, k = 3, category?: string): Promise<KnowledgeHit[]> {
  return (await retrieveKnowledgeByStrategy(query, k, "hybrid", category)).hits;
}

export type IndexDocumentResult = {
  chunkCount: number;
  status: "ready" | "ready_lexical";
  embeddingProvider: string | null;
  errorCode: string | null;
};

export async function indexDocument(
  docId: number,
  provider: EmbeddingProvider | null = getEmbeddingProvider(),
): Promise<IndexDocumentResult> {
  await ensureSearchInfrastructure();
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) throw new Error("文档不存在");

  const chunks = chunkText(doc.content);
  let embeddings: number[][] | null = null;
  let errorCode: string | null = null;
  if (provider) {
    try {
      embeddings = await provider.embedDocuments(chunks);
    } catch (error) {
      errorCode = error instanceof EmbeddingError ? error.code : "provider_error";
    }
  }

  const metadata = embeddings ? provider?.metadata : undefined;
  const status = embeddings ? "ready" : "ready_lexical";
  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({ where: { docId } });
    for (const [ordinal, content] of chunks.entries()) {
      const chunk = await tx.knowledgeChunk.create({
        data: {
          docId,
          ordinal,
          content,
          contentHash: createHash("sha256").update(content).digest("hex"),
          embeddingProvider: metadata?.provider,
          embeddingModel: metadata?.model,
          embeddingVersion: metadata?.version,
          embeddedAt: embeddings ? new Date() : undefined,
        },
      });
      const embedding = embeddings?.[ordinal];
      if (embedding) {
        const literal = vectorLiteral(embedding);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "KnowledgeChunk"
          SET embedding = ${literal}::vector
          WHERE id = ${chunk.id}
        `);
      }
    }
    await tx.knowledgeDoc.update({
      where: { id: docId },
      data: { status, chunkCount: chunks.length, indexErrorCode: errorCode },
    });
  });
  return {
    chunkCount: chunks.length,
    status,
    embeddingProvider: metadata?.provider ?? null,
    errorCode,
  };
}
