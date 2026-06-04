/**
 * 澄清服务
 * 处理需求分析、问题生成、多轮澄清闭环
 */

import type { RequirementQuestion } from "@dev-platform/shared";
import type { AiClient, ChatMessage } from "../ai/client.js";

export interface ClarificationResult {
  questions: RequirementQuestion[];
  canStartDevelopment: boolean;
  summary: string;
}

export interface FollowUpResult {
  questions: RequirementQuestion[];
  conflicts: Array<{ questionId: string; description: string }>;
  canContinue: boolean;
  summary: string;
}

export interface DevelopmentReadiness {
  ready: boolean;
  score: number;
  remainingIssues: string[];
  recommendations: string[];
}

// 需求分析 Prompt
const REQUIREMENT_ANALYSIS_SYSTEM_PROMPT = `你是一个专业的需求分析师 AI。你的任务是分析用户提供的需求文档，识别其中不明确、不完整或可能有歧义的点，并生成结构化的问题清单。

你需要关注以下维度：
1. 业务规则：核心逻辑是否有例外场景、特殊处理分支
2. 字段定义：关键数据字段是否明确定义、格式、范围
3. 权限控制：哪些角色可以操作、审批、查看
4. 异常处理：错误场景、边界条件如何处理
5. 验收标准：什么情况下算完成、测试标准是什么
6. 非功能需求：性能、安全、兼容性要求

每个问题必须包含：
- 问题本身
- 为什么要问这个问题（影响范围）
- 候选答案供业务选择
- 优先级（blocking/high/medium/low）`;

const REQUIREMENT_ANALYSIS_USER_PROMPT = (requirementText: string, projectContext?: string) => `
请分析以下需求文档，生成澄清问题清单。

## 需求内容
${requirementText}

${projectContext ? `## 项目背景\n${projectContext}` : ""}

请以 JSON 格式返回，格式如下：
{
  "questions": [
    {
      "id": "Q-001",
      "category": "business_rule|field_definition|permission|exception|acceptance|non_functional",
      "priority": "blocking|high|medium|low",
      "question": "具体问题",
      "whyNeeded": "为什么需要澄清这个问题",
      "impactScope": ["影响范围1", "影响范围2"],
      "candidateAnswers": ["候选答案1", "候选答案2"]
    }
  ],
  "canStartDevelopment": false,
  "summary": "整体分析总结"
}

要求：
1. 问题数量 3-8 个，聚焦关键问题
2. blocking 级别的问题会阻止进入开发
3. 每个问题必须有具体的候选答案
4. 如果需求足够清晰，canStartDevelopment 可以为 true
`;

// 追问 Prompt
const FOLLOW_UP_SYSTEM_PROMPT = `你是一个需求澄清专家 AI。你的任务是根据业务方提供的答案，检查是否有矛盾、遗漏或需要进一步澄清的点。

你需要：
1. 检查答案与原始需求是否一致
2. 检查答案之间是否存在矛盾
3. 识别是否需要追问
4. 判断是否可以进入开发阶段`;

const FOLLOW_UP_USER_PROMPT = (
  requirementText: string,
  questions: RequirementQuestion[],
  answers: Array<{ questionId: string; answer: string }>
) => `
## 原始需求
${requirementText}

## 上一轮问题
${JSON.stringify(questions, null, 2)}

## 业务反馈
${JSON.stringify(answers, null, 2)}

请分析业务反馈，检查是否有矛盾或需要追问的点。以 JSON 格式返回：
{
  "questions": [
    {
      "id": "Q-XXX",
      "category": "...",
      "priority": "...",
      "question": "追问问题（如果没有追问则为空数组）",
      "whyNeeded": "...",
      "impactScope": [...],
      "candidateAnswers": [...]
    }
  ],
  "conflicts": [
    {
      "questionId": "Q-XXX",
      "description": "矛盾描述"
    }
  ],
  "canContinue": true/false,
  "summary": "分析总结"
}

要求：
1. 如果答案清晰无矛盾，questions 可以为空数组
2. 如果发现矛盾，必须在 conflicts 中说明
3. canContinue 表示是否可以继续流程（无阻断级未决问题）
`;

export class ClarificationService {
  constructor(private aiClient: AiClient) {}

  // 分析需求，生成问题清单
  async analyzeRequirement(requirementText: string, projectContext?: string): Promise<ClarificationResult> {
    const messages: ChatMessage[] = [
      { role: "system", content: REQUIREMENT_ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: REQUIREMENT_ANALYSIS_USER_PROMPT(requirementText, projectContext) }
    ];

    const response = await this.aiClient.chatJson<ClarificationResult>(messages);

    if (!response.data) {
      // 返回默认结果
      return {
        questions: [],
        canStartDevelopment: false,
        summary: "AI 分析失败，请检查 AI 配置或重试。"
      };
    }

    return response.data;
  }

  // 基于答案生成追问
  async generateFollowUp(
    requirementText: string,
    previousQuestions: RequirementQuestion[],
    answers: Array<{ questionId: string; answer: string }>
  ): Promise<FollowUpResult> {
    const messages: ChatMessage[] = [
      { role: "system", content: FOLLOW_UP_SYSTEM_PROMPT },
      { role: "user", content: FOLLOW_UP_USER_PROMPT(requirementText, previousQuestions, answers) }
    ];

    const response = await this.aiClient.chatJson<FollowUpResult>(messages);

    if (!response.data) {
      return {
        questions: [],
        conflicts: [],
        canContinue: true,
        summary: "AI 分析失败，请检查 AI 配置或重试。"
      };
    }

    return response.data;
  }

  // 判断是否可进入开发
  async checkDevelopmentReadiness(
    requirementText: string,
    allQuestions: RequirementQuestion[],
    allAnswers: Array<{ questionId: string; answer: string }>
  ): Promise<DevelopmentReadiness> {
    const prompt = `
基于以下信息判断需求是否可以进入开发阶段：

## 原始需求
${requirementText}

## 已澄清的问题和答案
${JSON.stringify(
  allQuestions.map((q) => ({
    question: q.question,
    answer: allAnswers.find((a) => a.questionId === q.id)?.answer || "未回答"
  })),
  null,
  2
)}

请以 JSON 格式返回：
{
  "ready": true/false,
  "score": 0-100,
  "remainingIssues": ["未解决的问题1"],
  "recommendations": ["建议1"]
}
`;

    const messages: ChatMessage[] = [
      { role: "system", content: "你是一个项目管理专家，负责判断需求是否满足开发条件。" },
      { role: "user", content: prompt }
    ];

    const response = await this.aiClient.chatJson<DevelopmentReadiness>(messages);

    if (!response.data) {
      return {
        ready: false,
        score: 0,
        remainingIssues: ["AI 评估失败"],
        recommendations: []
      };
    }

    return response.data;
  }
}
