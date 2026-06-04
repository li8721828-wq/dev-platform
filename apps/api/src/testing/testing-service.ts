/**
 * 自动测试集成服务
 */
import type { AiClient } from "../ai/client.js";
import type { TestCase, TestResult } from "@dev-platform/shared";

export interface TestPlan {
  overview: string;
  scope: string[];
  testStrategy: string;
  testTypes: Array<{ type: string; count: number; description: string }>;
}

export interface TestGenerationOutput {
  testPlan: TestPlan;
  testCases: TestCase[];
}

export interface TestAnalysisOutput {
  summary: string;
  failedTests: Array<{ name: string; reason: string; fixSuggestion: string }>;
  coverageAssessment: string;
  recommendations: string[];
}

export class TestingService {
  constructor(private aiClient: AiClient) {}

  async generateTestPlan(
    requirementText: string,
    design: unknown,
    codeFiles: Array<{ path: string; content: string }>
  ): Promise<TestGenerationOutput> {
    const systemPrompt = `你是一位资深测试工程师。请基于需求和设计文档生成测试计划和测试用例。

输出要求（严格 JSON 格式）：
{
  "testPlan": {
    "overview": "测试概述",
    "scope": ["测试范围1"],
    "testStrategy": "测试策略描述",
    "testTypes": [{"type": "unit/integration/e2e", "count": 5, "description": "描述"}]
  },
  "testCases": [
    {
      "id": "TC-001",
      "name": "测试名称",
      "type": "unit",
      "description": "测试描述",
      "filePath": "tests/xxx.test.ts",
      "content": "测试代码内容"
    }
  ]
}`;

    const codeSummary = codeFiles.map(f => `文件: ${f.path}\n${f.content.slice(0, 500)}`).join("\n---\n");

    const userPrompt = `需求：${requirementText}

设计文档摘要：
${JSON.stringify(design).slice(0, 2000)}

代码文件：
${codeSummary}

请生成测试计划和测试用例。`;

    const result = await this.aiClient.chatJson<TestGenerationOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!result.data) {
      throw new Error(`测试计划生成失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }

  async analyzeTestResults(
    testOutput: string,
    requirementText: string
  ): Promise<TestAnalysisOutput> {
    const systemPrompt = `你是一位测试结果分析专家。请分析测试执行结果，识别失败原因并提供修复建议。

输出要求（严格 JSON 格式）：
{
  "summary": "测试结果总结",
  "failedTests": [{"name": "测试名", "reason": "失败原因", "fixSuggestion": "修复建议"}],
  "coverageAssessment": "覆盖率评估",
  "recommendations": ["建议1", "建议2"]
}`;

    const result = await this.aiClient.chatJson<TestAnalysisOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: `需求背景：${requirementText}\n\n测试输出：\n${testOutput}` }
    ]);

    if (!result.data) {
      throw new Error(`测试结果分析失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }
}
