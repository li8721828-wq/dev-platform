/**
 * 反思服务
 * 每个阶段完成后生成反思报告，作为质量门禁
 */

import type { AiClient, ChatMessage } from "../ai/client.js";

export interface ReflectionIssue {
  type: "completeness" | "accuracy" | "consistency" | "executability" | "risk" | "evidence";
  severity: "blocking" | "warning" | "info";
  description: string;
  suggestion: string;
}

export interface ConsistencyCheck {
  requirement_vs_analysis: "pass" | "fail" | "partial";
  analysis_vs_questions: "pass" | "fail" | "partial";
  questions_vs_answers: "pass" | "fail" | "partial";
}

export interface ReflectionReport {
  stage: string;
  score: number;
  canContinue: boolean;
  blockingIssues: ReflectionIssue[];
  nonBlockingIssues: ReflectionIssue[];
  consistencyCheck: ConsistencyCheck;
  evidence: string[];
  nextAction: string;
  summary: string;
}

// 反思 Prompt
const REFLECTION_SYSTEM_PROMPT = `你是一个独立的质量审查 AI（反思 Agent）。你的职责是对需求分析阶段的产出进行客观评估。

你必须与执行 Agent 隔离，你的任务是质疑、校验和打分，而不是自我确认。

评估维度：
1. 完整性：需求是否覆盖所有关键方面（业务规则、权限、异常、验收标准等）
2. 准确性：分析结论是否被需求文档支持
3. 一致性：需求、问题、答案之间是否矛盾
4. 可执行性：澄清后的需求是否可拆分成具体开发任务
5. 风险：是否识别了关键风险（安全、性能、数据等）
6. 证据链：每个判断是否有明确的来源支持`;

const REFLECTION_USER_PROMPT = (
  stage: string,
  requirementText: string,
  questions: unknown[],
  answers: unknown[],
  previousReflection?: unknown
) => `
请对以下${stage}阶段的产出进行反思评估。

## 原始需求
${requirementText}

## 生成的问题（${questions.length} 个）
${JSON.stringify(questions, null, 2)}

## 业务反馈/答案（${answers.length} 个）
${JSON.stringify(answers, null, 2)}

${previousReflection ? `## 上一轮反思\n${JSON.stringify(previousReflection, null, 2)}` : ""}

请以 JSON 格式返回反思报告：
{
  "stage": "${stage}",
  "score": 0-100,
  "canContinue": true/false,
  "blockingIssues": [
    {
      "type": "completeness|accuracy|consistency|executability|risk|evidence",
      "severity": "blocking",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "nonBlockingIssues": [
    {
      "type": "...",
      "severity": "warning|info",
      "description": "...",
      "suggestion": "..."
    }
  ],
  "consistencyCheck": {
    "requirement_vs_analysis": "pass|fail|partial",
    "analysis_vs_questions": "pass|fail|partial",
    "questions_vs_answers": "pass|fail|partial"
  },
  "evidence": ["证据1", "证据2"],
  "nextAction": "下一步建议",
  "summary": "总体评估"
}

评分标准：
- 90-100：优秀，可进入下一阶段
- 75-89：良好，建议处理非阻断问题后继续
- 60-74：及格，需要补充完善
- 0-59：不合格，必须重新处理

canContinue 规则：
- 无 blocking 级别问题且 score >= 70 时为 true
- 存在 blocking 问题或 score < 70 时为 false
`;

export class ReflectionService {
  constructor(private aiClient: AiClient) {}

  // 生成反思报告
  async generateReflection(
    stage: string,
    requirementText: string,
    questions: unknown[],
    answers: unknown[],
    previousReflection?: unknown
  ): Promise<ReflectionReport> {
    const messages: ChatMessage[] = [
      { role: "system", content: REFLECTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: REFLECTION_USER_PROMPT(stage, requirementText, questions, answers, previousReflection)
      }
    ];

    const response = await this.aiClient.chatJson<ReflectionReport>(messages);

    if (!response.data) {
      // 返回默认报告
      return {
        stage,
        score: 0,
        canContinue: false,
        blockingIssues: [
          {
            type: "evidence",
            severity: "blocking",
            description: "AI 反思失败，无法生成评估报告",
            suggestion: "请检查 AI 配置或重试"
          }
        ],
        nonBlockingIssues: [],
        consistencyCheck: {
          requirement_vs_analysis: "fail",
          analysis_vs_questions: "fail",
          questions_vs_answers: "fail"
        },
        evidence: [],
        nextAction: "修复 AI 服务后重试",
        summary: "反思报告生成失败"
      };
    }

    return response.data;
  }
}
