import { randomUUID } from "node:crypto";
import type { ProjectSummary, RequirementQuestion, WorkflowSummary, DesignDocument, CodingTask, TestRun, CodeReviewRecord, DeployConfig } from "@dev-platform/shared";

export interface RequirementAnalysisRecord {
  id: string;
  projectId: string;
  workflowId: string | null;
  requirementText: string;
  questions: RequirementQuestion[];
  reflection: unknown;
  createdAt: string;
}

export interface ClarificationRound {
  id: string;
  projectId: string;
  workflowId: string | null;
  roundNo: number;
  questions: RequirementQuestion[];
  answers: Array<{ questionId: string; answer: string }>;
  status: "pending" | "answered" | "follow_up" | "closed";
  createdAt: string;
}

export interface ReflectionReportRecord {
  id: string;
  workflowId: string | null;
  stage: string;
  score: number;
  canContinue: boolean;
  blockingIssues: unknown[];
  nonBlockingIssues: unknown[];
  consistencyCheck: unknown;
  evidence: string[];
  nextAction: string;
  summary: string;
  createdAt: string;
}

export interface AiProviderRecord {
  id: string;
  providerId: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  isActive: boolean;
  createdAt: string;
}

export interface GitProjectInfo {
  gitUrl?: string;
  repoPath?: string;
  defaultBranch?: string;
}

export interface AppStore {
  kind: "memory";
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
  createProject(input: { name: string; description: string; gitUrl?: string }): Promise<{ project: ProjectSummary; workflow: WorkflowSummary }>;
  updateProjectGitInfo(projectId: string, info: GitProjectInfo): Promise<void>;
  listWorkflowsByProject(projectId: string): Promise<WorkflowSummary[]>;
  updateWorkflowStage(input: {
    workflowId: string;
    currentStage: WorkflowSummary["currentStage"];
    status: WorkflowSummary["status"];
  }): Promise<void>;
  saveRequirementAnalysis(input: {
    projectId: string;
    workflowId: string | null;
    requirementText: string;
    questions: RequirementQuestion[];
    reflection: unknown;
  }): Promise<RequirementAnalysisRecord>;
  saveClarificationRound(input: {
    projectId: string;
    workflowId: string | null;
    roundNo: number;
    questions: RequirementQuestion[];
    answers: Array<{ questionId: string; answer: string }>;
    status: ClarificationRound["status"];
  }): Promise<ClarificationRound>;
  updateClarificationRound(input: {
    id: string;
    answers: Array<{ questionId: string; answer: string }>;
    status: ClarificationRound["status"];
  }): Promise<void>;
  listClarificationRounds(projectId: string): Promise<ClarificationRound[]>;
  getClarificationRound(roundId: string): Promise<ClarificationRound | null>;
  saveReflectionReport(input: {
    workflowId: string | null;
    stage: string;
    score: number;
    canContinue: boolean;
    blockingIssues: unknown[];
    nonBlockingIssues: unknown[];
    consistencyCheck: unknown;
    evidence: string[];
    nextAction: string;
    summary: string;
  }): Promise<ReflectionReportRecord>;
  getReflectionReport(reportId: string): Promise<ReflectionReportRecord | null>;
  listReflectionReportsByWorkflow(workflowId: string): Promise<ReflectionReportRecord[]>;
  saveAiProvider(input: {
    providerId: string; name: string; apiKey: string; baseUrl?: string; model: string; isActive: boolean;
  }): Promise<AiProviderRecord>;
  getActiveAiProvider(): Promise<AiProviderRecord | null>;
  listAiProviders(): Promise<AiProviderRecord[]>;
  deleteAiProvider(id: string): Promise<void>;
  activateAiProvider(id: string): Promise<void>;
  deactivateAllAiProviders(): Promise<void>;
  saveDesignDocument(input: {
    projectId: string; workflowId: string | null; type: DesignDocument["type"]; title: string; content: unknown;
  }): Promise<DesignDocument>;
  getDesignDocument(docId: string): Promise<DesignDocument | null>;
  listDesignDocuments(projectId: string): Promise<DesignDocument[]>;
  updateDesignDocument(input: { id: string; content?: unknown; status?: DesignDocument["status"]; reviewResult?: unknown }): Promise<void>;
  saveCodingTask(input: {
    projectId: string; workflowId: string | null; designDocId: string | null;
    files: CodingTask["files"]; traceability: CodingTask["traceability"]; agentRole: string;
  }): Promise<CodingTask>;
  getCodingTask(taskId: string): Promise<CodingTask | null>;
  listCodingTasks(projectId: string): Promise<CodingTask[]>;
  updateCodingTask(input: { id: string; status?: CodingTask["status"]; files?: CodingTask["files"]; appliedAt?: string }): Promise<void>;
  saveTestRun(input: {
    projectId: string; workflowId: string | null; testPlan: unknown; testCases: TestRun["testCases"]; status: TestRun["status"];
  }): Promise<TestRun>;
  getTestRun(runId: string): Promise<TestRun | null>;
  listTestRuns(projectId: string): Promise<TestRun[]>;
  updateTestRun(input: { id: string; results?: TestRun["results"]; summary?: TestRun["summary"]; status?: TestRun["status"]; analysis?: string; completedAt?: string }): Promise<void>;
  saveCodeReview(input: { projectId: string; workflowId: string | null; codeFiles: string[] }): Promise<CodeReviewRecord>;
  getCodeReview(reviewId: string): Promise<CodeReviewRecord | null>;
  listCodeReviews(projectId: string): Promise<CodeReviewRecord[]>;
  updateCodeReview(input: {
    id: string; aiReview?: CodeReviewRecord["aiReview"]; humanComments?: CodeReviewRecord["humanComments"];
    status?: CodeReviewRecord["status"]; finalReport?: unknown; finalizedAt?: string;
  }): Promise<void>;
  saveDeployConfig(input: {
    projectId: string; dockerfile: string; dockerCompose: string;
    envVars: DeployConfig["envVars"]; buildCommand: string; startCommand: string;
  }): Promise<DeployConfig>;
  getDeployConfig(projectId: string): Promise<DeployConfig | null>;
  updateDeployConfig(input: {
    projectId: string; dockerfile?: string; dockerCompose?: string;
    envVars?: DeployConfig["envVars"]; buildCommand?: string; startCommand?: string; status?: DeployConfig["status"];
  }): Promise<void>;
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export async function createStore(): Promise<AppStore> {
  return new MemoryStore();
}

class MemoryStore implements AppStore {
  kind: "memory" = "memory";
  private projects = new Map<string, ProjectSummary>();
  private workflows = new Map<string, WorkflowSummary>();
  private analyses = new Map<string, RequirementAnalysisRecord>();
  private clarificationRounds = new Map<string, ClarificationRound>();
  private reflectionReports = new Map<string, ReflectionReportRecord>();
  private aiProviders = new Map<string, AiProviderRecord>();
  private projectGitInfo = new Map<string, GitProjectInfo>();
  private designDocuments = new Map<string, DesignDocument>();
  private codingTasks = new Map<string, CodingTask>();
  private testRuns = new Map<string, TestRun>();
  private codeReviews = new Map<string, CodeReviewRecord>();
  private deployConfigs = new Map<string, DeployConfig>();

  async listProjects() {
    return [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }

  async createProject(input: { name: string; description: string; gitUrl?: string }) {
    const timestamp = now();
    const project: ProjectSummary = {
      id: id("prj"), name: input.name, description: input.description,
      status: "created", createdAt: timestamp, updatedAt: timestamp
    };
    const workflow: WorkflowSummary = {
      id: id("wf"), projectId: project.id,
      currentStage: "PROJECT_IMPORTED", status: "waiting", updatedAt: timestamp
    };
    if (input.gitUrl) this.projectGitInfo.set(project.id, { gitUrl: input.gitUrl });
    this.projects.set(project.id, project);
    this.workflows.set(workflow.id, workflow);
    return { project, workflow };
  }

  async updateProjectGitInfo(projectId: string, info: GitProjectInfo) {
    const existing = this.projectGitInfo.get(projectId) ?? {};
    this.projectGitInfo.set(projectId, { ...existing, ...info });
  }

  async listWorkflowsByProject(projectId: string) {
    return [...this.workflows.values()].filter((w) => w.projectId === projectId);
  }

  async updateWorkflowStage(input: { workflowId: string; currentStage: WorkflowSummary["currentStage"]; status: WorkflowSummary["status"] }) {
    const workflow = this.workflows.get(input.workflowId);
    if (workflow) {
      workflow.currentStage = input.currentStage;
      workflow.status = input.status;
      workflow.updatedAt = now();
    }
  }

  async saveRequirementAnalysis(input: { projectId: string; workflowId: string | null; requirementText: string; questions: RequirementQuestion[]; reflection: unknown }) {
    const record: RequirementAnalysisRecord = {
      id: id("ra"), projectId: input.projectId, workflowId: input.workflowId,
      requirementText: input.requirementText, questions: input.questions, reflection: input.reflection, createdAt: now()
    };
    this.analyses.set(record.id, record);
    return record;
  }

  async saveClarificationRound(input: { projectId: string; workflowId: string | null; roundNo: number; questions: RequirementQuestion[]; answers: Array<{ questionId: string; answer: string }>; status: ClarificationRound["status"] }) {
    const record: ClarificationRound = {
      id: id("cr"), projectId: input.projectId, workflowId: input.workflowId,
      roundNo: input.roundNo, questions: input.questions, answers: input.answers, status: input.status, createdAt: now()
    };
    this.clarificationRounds.set(record.id, record);
    return record;
  }

  async updateClarificationRound(input: { id: string; answers: Array<{ questionId: string; answer: string }>; status: ClarificationRound["status"] }) {
    const record = this.clarificationRounds.get(input.id);
    if (record) { record.answers = input.answers; record.status = input.status; }
  }

  async listClarificationRounds(projectId: string) {
    return [...this.clarificationRounds.values()].filter((r) => r.projectId === projectId).sort((a, b) => a.roundNo - b.roundNo);
  }

  async getClarificationRound(roundId: string) { return this.clarificationRounds.get(roundId) ?? null; }

  async saveReflectionReport(input: { workflowId: string | null; stage: string; score: number; canContinue: boolean; blockingIssues: unknown[]; nonBlockingIssues: unknown[]; consistencyCheck: unknown; evidence: string[]; nextAction: string; summary: string }) {
    const record: ReflectionReportRecord = {
      id: id("rr"), workflowId: input.workflowId, stage: input.stage, score: input.score,
      canContinue: input.canContinue, blockingIssues: input.blockingIssues, nonBlockingIssues: input.nonBlockingIssues,
      consistencyCheck: input.consistencyCheck, evidence: input.evidence, nextAction: input.nextAction, summary: input.summary, createdAt: now()
    };
    this.reflectionReports.set(record.id, record);
    return record;
  }

  async getReflectionReport(reportId: string) { return this.reflectionReports.get(reportId) ?? null; }

  async listReflectionReportsByWorkflow(workflowId: string) {
    return [...this.reflectionReports.values()].filter((r) => r.workflowId === workflowId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveAiProvider(input: { providerId: string; name: string; apiKey: string; baseUrl?: string; model: string; isActive: boolean }) {
    if (input.isActive) { for (const p of this.aiProviders.values()) p.isActive = false; }
    const record: AiProviderRecord = {
      id: id("aip"), providerId: input.providerId, name: input.name, apiKey: input.apiKey,
      baseUrl: input.baseUrl, model: input.model, isActive: input.isActive, createdAt: now()
    };
    this.aiProviders.set(record.id, record);
    return record;
  }

  async getActiveAiProvider() {
    for (const p of this.aiProviders.values()) { if (p.isActive) return p; }
    return null;
  }

  async listAiProviders() {
    return [...this.aiProviders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAiProvider(id: string) {
    this.aiProviders.delete(id);
  }

  async activateAiProvider(id: string) {
    for (const p of this.aiProviders.values()) p.isActive = p.id === id;
  }

  async deactivateAllAiProviders() {
    for (const p of this.aiProviders.values()) p.isActive = false;
  }

  async saveDesignDocument(input: { projectId: string; workflowId: string | null; type: DesignDocument["type"]; title: string; content: unknown }) {
    const timestamp = now();
    const record: DesignDocument = {
      id: id("dd"), projectId: input.projectId, workflowId: input.workflowId,
      type: input.type, title: input.title, content: input.content,
      version: 1, status: "draft", reviewResult: null, createdAt: timestamp, updatedAt: timestamp
    };
    this.designDocuments.set(record.id, record);
    return record;
  }

  async getDesignDocument(docId: string) { return this.designDocuments.get(docId) ?? null; }

  async listDesignDocuments(projectId: string) {
    return [...this.designDocuments.values()].filter(d => d.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateDesignDocument(input: { id: string; content?: unknown; status?: DesignDocument["status"]; reviewResult?: unknown }) {
    const doc = this.designDocuments.get(input.id);
    if (doc) {
      if (input.content !== undefined) doc.content = input.content;
      if (input.status !== undefined) doc.status = input.status;
      if (input.reviewResult !== undefined) doc.reviewResult = input.reviewResult;
      doc.updatedAt = now();
    }
  }

  async saveCodingTask(input: { projectId: string; workflowId: string | null; designDocId: string | null; files: CodingTask["files"]; traceability: CodingTask["traceability"]; agentRole: string }) {
    const record: CodingTask = {
      id: id("ct"), projectId: input.projectId, workflowId: input.workflowId,
      designDocId: input.designDocId, files: input.files, traceability: input.traceability,
      status: "generating", agentRole: input.agentRole, createdAt: now()
    };
    this.codingTasks.set(record.id, record);
    return record;
  }

  async getCodingTask(taskId: string) { return this.codingTasks.get(taskId) ?? null; }

  async listCodingTasks(projectId: string) {
    return [...this.codingTasks.values()].filter(t => t.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateCodingTask(input: { id: string; status?: CodingTask["status"]; files?: CodingTask["files"]; appliedAt?: string }) {
    const task = this.codingTasks.get(input.id);
    if (task) {
      if (input.status !== undefined) task.status = input.status;
      if (input.files !== undefined) task.files = input.files;
      if (input.appliedAt !== undefined) task.appliedAt = input.appliedAt;
    }
  }

  async saveTestRun(input: { projectId: string; workflowId: string | null; testPlan: unknown; testCases: TestRun["testCases"]; status: TestRun["status"] }) {
    const record: TestRun = {
      id: id("tr"), projectId: input.projectId, workflowId: input.workflowId,
      testPlan: input.testPlan, testCases: input.testCases, results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, error: 0 }, status: input.status, createdAt: now()
    };
    this.testRuns.set(record.id, record);
    return record;
  }

  async getTestRun(runId: string) { return this.testRuns.get(runId) ?? null; }

  async listTestRuns(projectId: string) {
    return [...this.testRuns.values()].filter(r => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateTestRun(input: { id: string; results?: TestRun["results"]; summary?: TestRun["summary"]; status?: TestRun["status"]; analysis?: string; completedAt?: string }) {
    const run = this.testRuns.get(input.id);
    if (run) {
      if (input.results !== undefined) run.results = input.results;
      if (input.summary !== undefined) run.summary = input.summary;
      if (input.status !== undefined) run.status = input.status;
      if (input.analysis !== undefined) run.analysis = input.analysis;
      if (input.completedAt !== undefined) run.completedAt = input.completedAt;
    }
  }

  async saveCodeReview(input: { projectId: string; workflowId: string | null; codeFiles: string[] }) {
    const record: CodeReviewRecord = {
      id: id("rv"), projectId: input.projectId, workflowId: input.workflowId,
      codeFiles: input.codeFiles, aiReview: [], humanComments: [],
      status: "pending", finalReport: null, createdAt: now()
    };
    this.codeReviews.set(record.id, record);
    return record;
  }

  async getCodeReview(reviewId: string) { return this.codeReviews.get(reviewId) ?? null; }

  async listCodeReviews(projectId: string) {
    return [...this.codeReviews.values()].filter(r => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateCodeReview(input: { id: string; aiReview?: CodeReviewRecord["aiReview"]; humanComments?: CodeReviewRecord["humanComments"]; status?: CodeReviewRecord["status"]; finalReport?: unknown; finalizedAt?: string }) {
    const review = this.codeReviews.get(input.id);
    if (review) {
      if (input.aiReview !== undefined) review.aiReview = input.aiReview;
      if (input.humanComments !== undefined) review.humanComments = input.humanComments;
      if (input.status !== undefined) review.status = input.status;
      if (input.finalReport !== undefined) review.finalReport = input.finalReport;
      if (input.finalizedAt !== undefined) review.finalizedAt = input.finalizedAt;
    }
  }

  async saveDeployConfig(input: { projectId: string; dockerfile: string; dockerCompose: string; envVars: DeployConfig["envVars"]; buildCommand: string; startCommand: string }) {
    const timestamp = now();
    const record: DeployConfig = {
      id: id("dc"), projectId: input.projectId, dockerfile: input.dockerfile,
      dockerCompose: input.dockerCompose, envVars: input.envVars,
      buildCommand: input.buildCommand, startCommand: input.startCommand,
      status: "draft", createdAt: timestamp, updatedAt: timestamp
    };
    this.deployConfigs.set(record.id, record);
    return record;
  }

  async getDeployConfig(projectId: string) {
    for (const c of this.deployConfigs.values()) { if (c.projectId === projectId) return c; }
    return null;
  }

  async updateDeployConfig(input: { projectId: string; dockerfile?: string; dockerCompose?: string; envVars?: DeployConfig["envVars"]; buildCommand?: string; startCommand?: string; status?: DeployConfig["status"] }) {
    const config = await this.getDeployConfig(input.projectId);
    if (config) {
      if (input.dockerfile !== undefined) config.dockerfile = input.dockerfile;
      if (input.dockerCompose !== undefined) config.dockerCompose = input.dockerCompose;
      if (input.envVars !== undefined) config.envVars = input.envVars;
      if (input.buildCommand !== undefined) config.buildCommand = input.buildCommand;
      if (input.startCommand !== undefined) config.startCommand = input.startCommand;
      if (input.status !== undefined) config.status = input.status;
      config.updatedAt = now();
    }
  }
}
