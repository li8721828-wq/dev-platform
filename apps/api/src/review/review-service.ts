/**
 * 代码审查服务（AI + 人工）
 */
import type { AiClient } from "../ai/client.js";
import type { ReviewIssue, HumanComment, GeneratedFile } from "@dev-platform/shared";

export interface AiReviewOutput {
  issues: ReviewIssue[];
  overallScore: number;
  summary: string;
  highlights: string[];
}

export interface FinalReviewReport {
  aiScore: number;
  humanApproved: boolean;
  totalIssues: number;
  criticalIssues: number;
  resolvedComments: number;
  pendingComments: number;
  conclusion: string;
  recommendations: string[];
}

export class ReviewService {
  constructor(private aiClient: AiClient) {}

  async aiReview(
    codeFiles: GeneratedFile[],
    design: unknown,
    requirements: string
  ): Promise<AiReviewOutput> {
    const systemPrompt = `你是一位资深代码审查专家。请从以下维度审查代码：
1. 逻辑正确性 - 业务逻辑是否正确
2. 安全性 - 是否有安全漏洞（SQL注入、XSS等）
3. 性能 - 是否有性能问题
4. 代码风格 - 命名、结构、可读性
5. 设计一致性 - 是否与设计文档一致
6. 错误处理 - 异常处理是否完善

输出要求（严格 JSON 格式）：
{
  "issues": [
    {
      "id": "ISS-001",
      "severity": "critical/major/minor/suggestion",
      "category": "logic/security/performance/style/design_consistency/error_handling",
      "file": "文件路径",
      "line": 10,
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "overallScore": 0-100,
  "summary": "审查总结",
  "highlights": ["亮点1", "亮点2"]
}`;

    const codeSummary = codeFiles.map(f =>
      `=== ${f.path} ===\n${f.content.slice(0, 1500)}`
    ).join("\n\n");

    const userPrompt = `需求：${requirements}

设计文档摘要：
${JSON.stringify(design).slice(0, 1000)}

代码文件：
${codeSummary}

请进行代码审查。`;

    const result = await this.aiClient.chatJson<AiReviewOutput>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    if (!result.data) {
      throw new Error(`AI 代码审查失败: ${result.error ?? "无法解析响应"}`);
    }
    return result.data;
  }

  async generateReviewReport(
    aiReview: AiReviewOutput,
    humanComments: HumanComment[]
  ): Promise<FinalReviewReport> {
    const criticalIssues = aiReview.issues.filter(i => i.severity === "critical").length;
    const majorIssues = aiReview.issues.filter(i => i.severity === "major").length;
    const resolvedComments = humanComments.filter(c => c.resolved).length;
    const pendingComments = humanComments.filter(c => !c.resolved).length;

    // AI 辅助生成最终结论
    const systemPrompt = `你是一位技术负责人。请基于 AI 审查结果和人工审查意见，生成最终审查报告。

输出（严格 JSON 格式）：
{
  "conclusion": "最终结论（通过/需修改/不通过）及原因",
  "recommendations": ["建议1", "建议2"]
}`;

    const userPrompt = `AI 审查得分：${aiReview.overallScore}
AI 发现问题：${aiReview.issues.length} 个（Critical: ${criticalIssues}, Major: ${majorIssues}）
人工意见：${humanComments.length} 条（已解决: ${resolvedComments}, 待处理: ${pendingComments}）

人工意见内容：
${humanComments.map(c => `- ${c.reviewer}: ${c.content}`).join("\n")}

请给出最终结论和建议。`;

    const result = await this.aiClient.chatJson<{ conclusion: string; recommendations: string[] }>([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    return {
      aiScore: aiReview.overallScore,
      humanApproved: humanComments.length > 0 && pendingComments === 0,
      totalIssues: aiReview.issues.length,
      criticalIssues,
      resolvedComments,
      pendingComments,
      conclusion: result.data?.conclusion ?? "审查完成",
      recommendations: result.data?.recommendations ?? []
    };
  }
}
