export type ExecutionStatus = "ok" | "disabled" | "degraded";
export type FallbackCode = "authentication" | "rate_limit" | "timeout" | "provider_error";

export type ProviderMetadata = {
  provider: "llm" | "rules";
  executionStatus: ExecutionStatus;
  fallbackCode?: FallbackCode;
};

export const LLM_STRUCTURED_OUTPUT_METHOD = "functionCalling" as const;

export function replySourceForProvider(provider: ProviderMetadata["provider"]): "llm" | "rules" {
  return provider;
}

export function normalizeDraftText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const value = candidate.status ?? candidate.statusCode;
  return typeof value === "number" ? value : undefined;
}

export function classifyProviderError(error: unknown): FallbackCode {
  const status = statusCode(error);
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate_limit";
  if (error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message))) {
    return "timeout";
  }
  return "provider_error";
}

export async function runProvider<T extends object>(params: {
  configured: boolean;
  invoke: () => Promise<T>;
  fallback: () => T;
}): Promise<T & ProviderMetadata> {
  if (!params.configured) {
    return {
      ...params.fallback(),
      provider: "rules",
      executionStatus: "disabled",
    };
  }

  try {
    return {
      ...(await params.invoke()),
      provider: "llm",
      executionStatus: "ok",
    };
  } catch (error) {
    return {
      ...params.fallback(),
      provider: "rules",
      executionStatus: "degraded",
      fallbackCode: classifyProviderError(error),
    };
  }
}
