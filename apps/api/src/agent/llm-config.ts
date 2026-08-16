export type LlmProvider = "deepseek" | "openai";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  baseURL: string;
  model: string;
};

/**
 * DeepSeek V4 enables thinking by default, but its thinking mode rejects the
 * forced tool choice used by LangChain structured output. Keep classification
 * and drafting on the same predictable, non-thinking request path.
 */
export function llmModelKwargs(provider: LlmProvider): Record<string, unknown> {
  return provider === "deepseek" ? { thinking: { type: "disabled" } } : {};
}

const DEFAULTS = {
  deepseek: { baseURL: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  openai: { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
} as const;

export function hasAnyLlmKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY);
}

export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const requestedValue = env.LLM_PROVIDER;
  if (requestedValue && requestedValue !== "deepseek" && requestedValue !== "openai") {
    throw new Error("LLM_PROVIDER must be deepseek or openai");
  }
  const requested = requestedValue as LlmProvider | undefined;
  const hasDeepSeek = Boolean(env.DEEPSEEK_API_KEY);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);
  if (!hasDeepSeek && !hasOpenAI) return null;
  if (!requested && hasDeepSeek && hasOpenAI) {
    throw new Error("LLM_PROVIDER is required when both provider keys are configured");
  }

  const provider: LlmProvider = requested ?? (hasDeepSeek ? "deepseek" : "openai");
  const apiKey = provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`Missing key for configured ${provider} provider`);
  const defaults = DEFAULTS[provider];
  const baseURL = env.LLM_BASE_URL || defaults.baseURL;
  const endpoint = new URL(baseURL);
  if (endpoint.protocol !== "https:") {
    throw new Error("LLM endpoint must use HTTPS");
  }
  const trustedOrigin = new URL(defaults.baseURL).origin;
  if (endpoint.origin !== trustedOrigin && env.LLM_ALLOW_CUSTOM_ENDPOINT !== "true") {
    throw new Error(`Endpoint does not match ${provider}; set LLM_ALLOW_CUSTOM_ENDPOINT=true only for a trusted proxy`);
  }
  return { provider, apiKey, baseURL, model: env.LLM_MODEL || defaults.model };
}

export function llmConfigurationStatus(env: NodeJS.ProcessEnv = process.env): "configured" | "rules_only" | "misconfigured" {
  try {
    return resolveLlmConfig(env) ? "configured" : "rules_only";
  } catch {
    return "misconfigured";
  }
}
