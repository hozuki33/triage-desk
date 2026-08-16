import { resolve } from "node:path";

export const EMBEDDING_DIMENSIONS = 512;
export const DEFAULT_EMBEDDING_MODEL = "Xenova/bge-small-zh-v1.5";
export const EMBEDDING_VERSION = "bge-small-zh-v1.5-cls-normalized-v1";
const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";
const TRUSTED_MODEL_HOSTS = new Set(["huggingface.co", "hf-mirror.com"]);

export type EmbeddingMetadata = {
  provider: string;
  model: string;
  version: string;
  dimensions: number;
};

export interface EmbeddingProvider {
  readonly metadata: EmbeddingMetadata;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export class EmbeddingError extends Error {
  constructor(
    readonly code: "model_unavailable" | "provider_error" | "dimension_mismatch",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "cls"; normalize: true },
) => Promise<{ tolist(): unknown[] }>;

let extractorPromise: Promise<FeatureExtractor> | undefined;

function validateVectors(value: unknown[], expectedCount: number): number[][] {
  const vectors = value as unknown[][];
  if (vectors.length !== expectedCount) {
    throw new EmbeddingError("dimension_mismatch", "Embedding 返回数量与输入不一致");
  }
  return vectors.map((candidate) => {
    if (
      !Array.isArray(candidate) ||
      candidate.length !== EMBEDDING_DIMENSIONS ||
      candidate.some((item) => typeof item !== "number" || !Number.isFinite(item))
    ) {
      throw new EmbeddingError("dimension_mismatch", `Embedding 必须是 ${EMBEDDING_DIMENSIONS} 维有限数值向量`);
    }
    return candidate as number[];
  });
}

async function loadExtractor(): Promise<FeatureExtractor> {
  extractorPromise ??= (async () => {
    try {
      const transformers = await import("@huggingface/transformers");
      transformers.env.cacheDir = process.env.EMBEDDING_CACHE_DIR || resolve(process.cwd(), ".model-cache");
      transformers.env.allowLocalModels = true;
      if (process.env.EMBEDDING_REMOTE_HOST) {
        const remoteHost = new URL(process.env.EMBEDDING_REMOTE_HOST);
        if (remoteHost.protocol !== "https:" || !TRUSTED_MODEL_HOSTS.has(remoteHost.hostname)) {
          throw new EmbeddingError("model_unavailable", "EMBEDDING_REMOTE_HOST 必须是可信的 HTTPS 模型源");
        }
        transformers.env.remoteHost = `${remoteHost.origin}/`;
      }
      const model = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
      const createPipeline = transformers.pipeline as unknown as (
        task: string,
        modelId: string,
        options: { dtype: string },
      ) => Promise<FeatureExtractor>;
      return await createPipeline("feature-extraction", model, {
        dtype: "q8",
      });
    } catch (error) {
      extractorPromise = undefined;
      throw new EmbeddingError("model_unavailable", "本地 Embedding 模型加载失败", { cause: error });
    }
  })();
  return extractorPromise;
}

export function createLocalEmbeddingProvider(): EmbeddingProvider {
  const model = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const metadata: EmbeddingMetadata = {
    provider: "local_transformers",
    model,
    version: EMBEDDING_VERSION,
    dimensions: EMBEDDING_DIMENSIONS,
  };

  async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    try {
      const extractor = await loadExtractor();
      const result = await extractor(texts, { pooling: "cls", normalize: true });
      return validateVectors(result.tolist(), texts.length);
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError("provider_error", "本地 Embedding 推理失败", { cause: error });
    }
  }

  return {
    metadata,
    embedDocuments: embed,
    async embedQuery(text: string) {
      const [vector] = await embed([`${QUERY_PREFIX}${text}`]);
      if (!vector) throw new EmbeddingError("provider_error", "Embedding 未返回查询向量");
      return vector;
    },
  };
}

export function getEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider | null {
  const configured = env.EMBEDDING_PROVIDER?.trim().toLowerCase() || "local";
  if (configured === "disabled") return null;
  if (configured !== "local") {
    throw new EmbeddingError("model_unavailable", `不支持的 EMBEDDING_PROVIDER：${configured}`);
  }
  return createLocalEmbeddingProvider();
}

export function embeddingConfigurationStatus(env: NodeJS.ProcessEnv = process.env): "local" | "disabled" | "misconfigured" {
  try {
    return getEmbeddingProvider(env) ? "local" : "disabled";
  } catch {
    return "misconfigured";
  }
}
