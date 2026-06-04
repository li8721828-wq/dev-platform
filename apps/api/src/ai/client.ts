/**
 * 统一 AI 调用客户端
 * 支持 OpenAI 兼容接口和 Anthropic 原生接口
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getProviderConfig, type AiProviderInstance } from "./providers.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StructuredAiResponse<T> {
  data: T | null;
  raw: string;
  error?: string;
}

// 统一 AI 客户端
export class AiClient {
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;

  constructor(private provider: AiProviderInstance) {
    const config = getProviderConfig(provider.providerId);
    if (!config) {
      throw new Error(`Unknown provider: ${provider.providerId}`);
    }

    if (config.apiType === "anthropic") {
      this.anthropicClient = new Anthropic({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl
      });
    } else {
      // OpenAI 兼容接口（包括 DeepSeek、Moonshot、Qwen、火山引擎、OpenRouter、Ollama 等）
      this.openaiClient = new OpenAI({
        apiKey: provider.apiKey || "ollama",
        baseURL: provider.baseUrl
      });
    }
  }

  // 发送聊天请求
  async chat(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AiResponse> {
    if (this.anthropicClient) {
      return this.chatAnthropic(messages, options);
    }
    return this.chatOpenAI(messages, options);
  }

  // 发送请求并解析 JSON 响应
  async chatJson<T>(messages: ChatMessage[], options?: { temperature?: number }): Promise<StructuredAiResponse<T>> {
    const systemMessage = messages.find((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    // 添加 JSON 格式指令
    const jsonInstruction = "请务必以 JSON 格式返回结果，不要包含 markdown 代码块标记。";
    const enhancedSystemContent = systemMessage
      ? `${systemMessage.content}\n\n${jsonInstruction}`
      : jsonInstruction;

    const enhancedMessages: ChatMessage[] = [
      { role: "system", content: enhancedSystemContent },
      ...otherMessages
    ];

    const response = await this.chat(enhancedMessages, { ...options, temperature: options?.temperature ?? 0.3 });
    const raw = response.content.trim();

    try {
      // 尝试提取 JSON（处理可能的 markdown 包裹）
      let jsonStr = raw;
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const data = JSON.parse(jsonStr) as T;
      return { data, raw };
    } catch {
      return { data: null, raw, error: "Failed to parse JSON response" };
    }
  }

  // OpenAI 兼容接口调用
  private async chatOpenAI(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AiResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const response = await this.openaiClient.chat.completions.create({
      model: this.provider.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? "",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
          }
        : undefined
    };
  }

  // Anthropic 原生接口调用
  private async chatAnthropic(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<AiResponse> {
    if (!this.anthropicClient) {
      throw new Error("Anthropic client not initialized");
    }

    // 分离 system message
    const systemMessage = messages.find((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const response = await this.anthropicClient.messages.create({
      model: this.provider.model,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }))
    });

    const textContent = response.content.find((block) => block.type === "text");
    return {
      content: textContent?.type === "text" ? textContent.text : "",
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      }
    };
  }
}

// 从提供商实例创建 AI 客户端
export function createAiClient(provider: AiProviderInstance): AiClient {
  return new AiClient(provider);
}
