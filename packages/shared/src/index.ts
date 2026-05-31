export type ProjectStatus = "created" | "importing" | "indexed" | "failed" | "archived";

export type WorkflowStage =
  | "PROJECT_IMPORTED"
  | "REQUIREMENT_ANALYZING"
  | "REQUIREMENT_QUESTIONING"
  | "CLARIFYING"
  | "READY_FOR_SOLUTION"
  | "SOLUTION_GENERATING"
  | "SOLUTION_REVIEWING"
  | "DETAIL_DESIGN_GENERATING"
  | "DETAIL_DESIGN_REVIEWING"
  | "CODING"
  | "SELF_TESTING"
  | "CODE_REVIEWING"
  | "READY_TO_DELIVER"
  | "DONE"
  | "WAITING_HUMAN_APPROVAL"
  | "FAILED"
  | "PAUSED"
  | "CANCELLED";

export type AgentRole =
  | "requirement_analyst"
  | "clarification"
  | "solution_designer"
  | "detail_designer"
  | "coder"
  | "tester"
  | "code_reviewer"
  | "aggregator"
  | "reflector";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSummary {
  id: string;
  projectId: string;
  currentStage: WorkflowStage;
  status: "running" | "waiting" | "failed" | "completed";
  updatedAt: string;
}

export interface RequirementQuestion {
  id: string;
  category: "business_rule" | "field_definition" | "permission" | "exception" | "acceptance" | "non_functional";
  priority: "blocking" | "high" | "medium" | "low";
  question: string;
  whyNeeded: string;
  impactScope: string[];
  candidateAnswers: string[];
}

export const workflowStageLabels: Record<WorkflowStage, string> = {
  PROJECT_IMPORTED: "项目已导入",
  REQUIREMENT_ANALYZING: "需求分析中",
  REQUIREMENT_QUESTIONING: "需求问题生成",
  CLARIFYING: "澄清中",
  READY_FOR_SOLUTION: "可进入方案",
  SOLUTION_GENERATING: "方案生成中",
  SOLUTION_REVIEWING: "方案评审中",
  DETAIL_DESIGN_GENERATING: "详细设计生成中",
  DETAIL_DESIGN_REVIEWING: "详细设计评审中",
  CODING: "编码中",
  SELF_TESTING: "自测中",
  CODE_REVIEWING: "代码审查中",
  READY_TO_DELIVER: "可交付",
  DONE: "已完成",
  WAITING_HUMAN_APPROVAL: "等待人工审批",
  FAILED: "失败",
  PAUSED: "已暂停",
  CANCELLED: "已取消"
};
