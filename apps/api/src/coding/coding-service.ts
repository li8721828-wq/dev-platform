/**
 * 单 Agent 编码 + 需求追溯服务
 */
import type { AiClient } from "../ai/client.js";
import type { GeneratedFile, TraceabilityEntry } from "@dev-platform/shared";
import fs from "node:fs/promises";
import path from "node:path";

export interface CodeGenerationOutput {
  files: GeneratedFile[];
  summary: string;
}

export class CodingService {
  constructor(private aiClient: AiClient) {}

  async generateCode(
    detailDesign: unknown,
    requirementText: string,
    clarifications: Array<{ question: string; answer: string }>,
    projectContext?: { projectName: string; techStack?: string[]; existingFiles?: string[] }
  ): Promise<CodeGenerationOutput> {
    const systemPrompt = `你是一位高级软件工程师。请基于详细设计文档生成代码文件。

输出要求（严格 JSON 格式）：
{
  "files": [
    {
      "path": "src/xxx.ts",
      "content": "完整文件内容（含 import、类型、实现）",
      "language": "typescript",
      "description": "文件说明"
    }
  ],
  "summary": "编码总结"
}

注意事项：
1. 生成完整可运行的代码，不要使用占位符
2. 包含必要的错误处理
3. 添加清晰的注释
4. 遵循项目技术栈规范`;

    const userPrompt = `项目：${projectContext?.projectName ?? "未知项目"}
技术栈：${projectContext?.techStack?.join(", ") ?? "TypeScript"}
${projectContext?.existingFiles?.length ? `已有文件（不要重复生成）：${projectContext.existingFiles.slice(0, 10).join(", ")}` : ""}

需求：
${requirementText}

详细设计：
${JSON.stringify(detailDesign, null, 2)}

请生成代码文件。`;

    const result = await this.aiClient.chatJson<CodeGenerationOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], { temperature: 0.2 });

    if (!result.data) {
      throw new Error(`AI 代码生成失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }

  async applyCode(repoPath: string, files: GeneratedFile[]): Promise<{ applied: string[]; errors: string[] }> {
    const applied: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const fullPath = path.join(repoPath, file.path);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, file.content, "utf-8");
        applied.push(file.path);
      } catch (error) {
        errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { applied, errors };
  }

  async generateTraceability(
    requirementText: string,
    clarifications: Array<{ question: string; answer: string }>,
    design: unknown,
    codeFiles: GeneratedFile[]
  ): Promise<TraceabilityEntry[]> {
    const systemPrompt = `你是一位需求追溯专家。请建立需求到设计到代码的追溯矩阵。

输出要求（严格 JSON 数组格式）：
[
  {
    "requirementId": "REQ-001",
    "requirementText": "需求描述",
    "designSection": "对应设计章节",
    "codeFiles": ["src/xxx.ts"],
    "testCases": [],
    "coverage": "covered/partial/missing"
  }
]`;

    const userPrompt = `需求：${requirementText}

设计文档摘要：
${JSON.stringify(design).slice(0, 2000)}

已生成代码文件：
${codeFiles.map(f => `- ${f.path}: ${f.description ?? "无描述"}`).join("\n")}

请建立追溯矩阵。`;

    const result = await this.aiClient.chatJson<TraceabilityEntry[]>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!result.data) {
      throw new Error(`追溯矩阵生成失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }
}
