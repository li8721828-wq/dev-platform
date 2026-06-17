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
  sourcePath?: string;
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

// ========== 方案设计 ==========
export interface DesignDocument {
  id: string;
  projectId: string;
  workflowId: string | null;
  type: "solution" | "detail_design";
  title: string;
  content: unknown;
  version: number;
  status: "draft" | "reviewing" | "approved" | "rejected";
  reviewResult: unknown;
  createdAt: string;
  updatedAt: string;
}

// ========== 编码任务 ==========
export interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
  description?: string;
}

export interface TraceabilityEntry {
  requirementId: string;
  requirementText: string;
  designSection?: string;
  codeFiles: string[];
  testCases?: string[];
  coverage: "covered" | "partial" | "missing";
}

export interface CodingTask {
  id: string;
  projectId: string;
  workflowId: string | null;
  designDocId: string | null;
  files: GeneratedFile[];
  traceability: TraceabilityEntry[];
  status: "generating" | "preview" | "applied" | "rejected" | "failed";
  agentRole: string;
  createdAt: string;
  appliedAt?: string;
}

// ========== 测试运行 ==========
export interface TestCase {
  id: string;
  name: string;
  type: "unit" | "integration" | "e2e";
  description: string;
  filePath?: string;
  content?: string;
}

export interface TestResult {
  testCaseId: string;
  status: "passed" | "failed" | "skipped" | "error";
  duration?: number;
  message?: string;
  stackTrace?: string;
}

export interface TestRun {
  id: string;
  projectId: string;
  workflowId: string | null;
  testPlan: unknown;
  testCases: TestCase[];
  results: TestResult[];
  summary: { total: number; passed: number; failed: number; skipped: number; error: number };
  status: "planning" | "generating" | "running" | "completed" | "failed";
  analysis?: string;
  createdAt: string;
  completedAt?: string;
}

// ========== 代码审查 ==========
export interface ReviewIssue {
  id: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  category: "logic" | "security" | "performance" | "style" | "design_consistency" | "error_handling";
  file: string;
  line?: number;
  description: string;
  suggestion: string;
}

export interface HumanComment {
  id: string;
  reviewer: string;
  file?: string;
  line?: number;
  content: string;
  resolved: boolean;
  createdAt: string;
}

export interface CodeReviewRecord {
  id: string;
  projectId: string;
  workflowId: string | null;
  codeFiles: string[];
  aiReview: ReviewIssue[];
  humanComments: HumanComment[];
  status: "pending" | "ai_reviewing" | "ai_reviewed" | "human_reviewing" | "finalized";
  finalReport: unknown;
  createdAt: string;
  finalizedAt?: string;
}

// ========== 部署配置 ==========
export interface DeployConfig {
  id: string;
  projectId: string;
  dockerfile: string;
  dockerCompose: string;
  envVars: Array<{ key: string; value: string; description?: string }>;
  buildCommand: string;
  startCommand: string;
  status: "draft" | "validated" | "deployed";
  createdAt: string;
  updatedAt: string;
}
