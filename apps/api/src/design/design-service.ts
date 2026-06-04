/**
 * 方案设计 + 详细设计生成服务
 */
import type { AiClient } from "../ai/client.js";
import type { RequirementQuestion } from "@dev-platform/shared";

export interface SolutionOutput {
  title: string;
  architecture: string;
  techStack: string[];
  modules: Array<{ name: string; description: string; responsibilities: string[] }>;
  interfaces: Array<{ name: string; method: string; path: string; description: string }>;
  dataModels: Array<{ name: string; fields: Array<{ name: string; type: string; description: string }> }>;
  risks: string[];
  summary: string;
}

export interface DetailDesignOutput {
  title: string;
  classDesigns: Array<{
    name: string;
    description: string;
    methods: Array<{ name: string; signature: string; description: string }>;
    dependencies: string[];
  }>;
  sequenceDiagrams: Array<{ name: string; description: string; participants: string[]; steps: string[] }>;
  errorHandling: Array<{ scenario: string; strategy: string }>;
  securityConsiderations: string[];
  performanceConsiderations: string[];
  summary: string;
}

export class DesignService {
  constructor(private aiClient: AiClient) {}

  async generateSolution(
    requirementText: string,
    clarifications: Array<{ question: string; answer: string }>,
    projectContext?: { projectName: string; existingFiles?: string[] }
  ): Promise<SolutionOutput> {
    const clarificationSummary = clarifications.length > 0
      ? clarifications.map((c, i) => `${i + 1}. 问题: ${c.question}\n   答案: ${c.answer}`).join("\n")
      : "无澄清信息";

    const systemPrompt = `你是一位资深软件架构师，擅长进行架构设计和方案规划。
请基于用户提供的需求和澄清信息，生成一份详细的方案设计文档。

输出要求（严格 JSON 格式）：
{
  "title": "方案名称",
  "architecture": "架构说明（1-2段）",
  "techStack": ["技术1", "技术2"],
  "modules": [{"name": "模块名", "description": "描述", "responsibilities": ["职责1"]}],
  "interfaces": [{"name": "接口名", "method": "GET/POST", "path": "/api/xxx", "description": "描述"}],
  "dataModels": [{"name": "模型名", "fields": [{"name": "字段名", "type": "类型", "description": "描述"}]}],
  "risks": ["风险1", "风险2"],
  "summary": "方案总结"
}`;

    const userPrompt = `项目：${projectContext?.projectName ?? "未知项目"}
${projectContext?.existingFiles?.length ? `已有文件：\n${projectContext.existingFiles.slice(0, 20).join("\n")}` : ""}

需求描述：
${requirementText}

澄清记录：
${clarificationSummary}

请生成方案设计文档。`;

    const result = await this.aiClient.chatJson<SolutionOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!result.data) {
      throw new Error(`AI 方案生成失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }

  async generateDetailDesign(
    solution: SolutionOutput,
    requirementText: string,
    clarifications: Array<{ question: string; answer: string }>,
    questions?: RequirementQuestion[]
  ): Promise<DetailDesignOutput> {
    const systemPrompt = `你是一位资深软件设计师，擅长将架构方案细化为详细设计文档。
请基于方案设计和需求信息，生成一份可直接指导编码的详细设计文档。

输出要求（严格 JSON 格式）：
{
  "title": "详细设计文档名称",
  "classDesigns": [{"name": "类名", "description": "描述", "methods": [{"name": "方法名", "signature": "签名", "description": "描述"}], "dependencies": ["依赖类"]}],
  "sequenceDiagrams": [{"name": "流程图名", "description": "描述", "participants": ["参与者"], "steps": ["步骤1", "步骤2"]}],
  "errorHandling": [{"scenario": "场景", "strategy": "处理策略"}],
  "securityConsiderations": ["安全考量1"],
  "performanceConsiderations": ["性能考量1"],
  "summary": "设计总结"
}`;

    const userPrompt = `需求描述：
${requirementText}

方案设计摘要：
架构：${solution.architecture}
技术栈：${solution.techStack.join(", ")}
模块：${solution.modules.map(m => m.name).join(", ")}

请生成详细设计文档。`;

    const result = await this.aiClient.chatJson<DetailDesignOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!result.data) {
      throw new Error(`AI 详细设计生成失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }

  async reviewDesign(
    designContent: unknown,
    designType: "solution" | "detail_design",
    requirementText: string
  ): Promise<{ score: number; issues: Array<{ severity: string; description: string }>; suggestion: string }> {
    const systemPrompt = `你是一位技术评审专家。请评审以下${designType === "solution" ? "方案设计" : "详细设计"}文档。
评估维度：完整性、合理性、可执行性、风险评估。

输出（严格 JSON 格式）：
{
  "score": 0-100,
  "issues": [{"severity": "critical/major/minor/suggestion", "description": "问题描述"}],
  "suggestion": "改进建议"
}`;

    const result = await this.aiClient.chatJson<{
      score: number;
      issues: Array<{ severity: string; description: string }>;
      suggestion: string;
    }>([
      { role: "system", content: systemPrompt },
      { role: "user", content: `需求：${requirementText}\n\n设计文档：\n${JSON.stringify(designContent, null, 2)}` }
    ]);

    if (!result.data) {
      throw new Error(`设计评审失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }
}
