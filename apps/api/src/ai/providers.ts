/**
 * AI 提供商注册和配置管理
 * 参照 OpenClaw 支持的提供商列表
 */

export interface AiProviderConfig {
  id: string;
  name: string;
  envKey: string;
  baseUrl?: string;
  defaultModel: string;
  apiType: "openai" | "anthropic" | "google";
  models: string[];
}

export interface AiProviderInstance {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

// 支持的 AI 提供商列表
export const SUPPORTED_PROVIDERS: AiProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    apiType: "openai",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
    apiType: "anthropic",
    models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    apiType: "openai",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    envKey: "MOONSHOT_API_KEY",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-128k",
    apiType: "openai",
    models: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k", "kimi-k2.5"]
  },
  {
    id: "qwen",
    name: "通义千问 / Qwen",
    envKey: "DASHSCOPE_API_KEY",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
    apiType: "openai",
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen3.5-plus"]
  },
  {
    id: "volcengine",
    name: "火山引擎 / Doubao",
    envKey: "VOLCANO_ENGINE_API_KEY",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-pro-32k",
    apiType: "openai",
    models: ["doubao-pro-32k", "doubao-lite-32k", "doubao-pro-128k"]
  },
  {
    id: "google",
    name: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.0-flash",
    apiType: "google",
    models: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro"]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
    apiType: "openai",
    models: ["openai/gpt-4o", "anthropic/claude-sonnet-4-20250514", "google/gemini-2.0-flash", "deepseek/deepseek-chat"]
  },
  {
    id: "ollama",
    name: "Ollama (本地)",
    envKey: "OLLAMA_API_KEY",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.3",
    apiType: "openai",
    models: ["llama3.3", "llama3.1", "qwen2.5", "deepseek-r1"]
  }
];

// 根据 provider id 获取配置
export function getProviderConfig(providerId: string): AiProviderConfig | undefined {
  return SUPPORTED_PROVIDERS.find((p) => p.id === providerId);
}

// 从环境变量创建提供商实例
export function createProviderFromEnv(providerId: string): AiProviderInstance | null {
  const config = getProviderConfig(providerId);
  if (!config) return null;

  const apiKey = process.env[config.envKey] || "";

  // Ollama 本地部署不需要 API Key
  if (providerId !== "ollama" && !apiKey) {
    return null;
  }

  return {
    providerId: config.id,
    apiKey,
    baseUrl: config.baseUrl,
    model: config.defaultModel
  };
}

// 获取所有可用的提供商（基于环境变量）
export function getAvailableProviders(): AiProviderConfig[] {
  return SUPPORTED_PROVIDERS.filter((provider) => {
    if (provider.id === "ollama") return true; // Ollama 始终可用
    return !!process.env[provider.envKey];
  });
}

// 获取提供商列表（用于前端展示）
export function getProvidersInfo() {
  return SUPPORTED_PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    envKey: provider.envKey,
    baseUrl: provider.baseUrl ?? "",
    defaultModel: provider.defaultModel,
    models: provider.models,
    apiType: provider.apiType,
    available: true,
    hasEnvKey: provider.id === "ollama" || !!process.env[provider.envKey]
  }));
}
