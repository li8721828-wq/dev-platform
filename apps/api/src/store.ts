import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
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

export async function createStore(dataFile?: string): Promise<AppStore> {
  const store = new MemoryStore();
  const file = dataFile ?? process.env.STORE_DATA_FILE ?? "storage/data.json";
  await store.hydrate(file);
  return store;
}

class MemoryStore implements AppStore {
  kind: "memory" = "memory";
  private dataFile = "";
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

  // 从 JSON 文件加载数据
  async hydrate(file: string) {
    this.dataFile = file;
    if (!existsSync(file)) return;
    try {
      const raw = readFileSync(file, "utf-8");
      const data = JSON.parse(raw) as {
        projects?: [string, ProjectSummary][];
        workflows?: [string, WorkflowSummary][];
        analyses?: [string, RequirementAnalysisRecord][];
        clarificationRounds?: [string, ClarificationRound][];
        reflectionReports?: [string, ReflectionReportRecord][];
        aiProviders?: [string, AiProviderRecord][];
        projectGitInfo?: [string, GitProjectInfo][];
        designDocuments?: [string, DesignDocument][];
        codingTasks?: [string, CodingTask][];
        testRuns?: [string, TestRun][];
        codeReviews?: [string, CodeReviewRecord][];
        deployConfigs?: [string, DeployConfig][];
      };
      if (data.projects) this.projects = new Map(data.projects);
      if (data.workflows) this.workflows = new Map(data.workflows);
      if (data.analyses) this.analyses = new Map(data.analyses);
      if (data.clarificationRounds) this.clarificationRounds = new Map(data.clarificationRounds);
      if (data.reflectionReports) this.reflectionReports = new Map(data.reflectionReports);
      if (data.aiProviders) this.aiProviders = new Map(data.aiProviders);
      if (data.projectGitInfo) this.projectGitInfo = new Map(data.projectGitInfo);
      if (data.designDocuments) this.designDocuments = new Map(data.designDocuments);
      if (data.codingTasks) this.codingTasks = new Map(data.codingTasks);
      if (data.testRuns) this.testRuns = new Map(data.testRuns);
      if (data.codeReviews) this.codeReviews = new Map(data.codeReviews);
      if (data.deployConfigs) this.deployConfigs = new Map(data.deployConfigs);
      console.log(`Store hydrated from ${file} (${this.projects.size} projects, ${this.aiProviders.size} AI providers)`);
    } catch (e) {
      console.error(`Failed to hydrate store from ${file}:`, e);
    }
  }

  // 持久化到 JSON 文件
  private persist() {
    if (!this.dataFile) return;
    try {
      const dir = dirname(this.dataFile);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = {
        projects: [...this.projects.entries()],
        workflows: [...this.workflows.entries()],
        analyses: [...this.analyses.entries()],
        clarificationRounds: [...this.clarificationRounds.entries()],
        reflectionReports: [...this.reflectionReports.entries()],
        aiProviders: [...this.aiProviders.entries()],
        projectGitInfo: [...this.projectGitInfo.entries()],
        designDocuments: [...this.designDocuments.entries()],
        codingTasks: [...this.codingTasks.entries()],
        testRuns: [...this.testRuns.entries()],
        codeReviews: [...this.codeReviews.entries()],
        deployConfigs: [...this.deployConfigs.entries()],
      };
      writeFileSync(this.dataFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error(`Failed to persist store to ${this.dataFile}:`, e);
    }
  }

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
    this.persist();
    return { project, workflow };
  }

  async updateProjectGitInfo(projectId: string, info: GitProjectInfo) {
    const existing = this.projectGitInfo.get(projectId) ?? {};
    this.projectGitInfo.set(projectId, { ...existing, ...info });
    this.persist();
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
      this.persist();
    }
  }

  async saveRequirementAnalysis(input: { projectId: string; workflowId: string | null; requirementText: string; questions: RequirementQuestion[]; reflection: unknown }) {
    const record: RequirementAnalysisRecord = {
      id: id("ra"), projectId: input.projectId, workflowId: input.workflowId,
      requirementText: input.requirementText, questions: input.questions, reflection: input.reflection, createdAt: now()
    };
    this.analyses.set(record.id, record);
    this.persist();
    return record;
  }

  async saveClarificationRound(input: { projectId: string; workflowId: string | null; roundNo: number; questions: RequirementQuestion[]; answers: Array<{ questionId: string; answer: string }>; status: ClarificationRound["status"] }) {
    const record: ClarificationRound = {
      id: id("cr"), projectId: input.projectId, workflowId: input.workflowId,
      roundNo: input.roundNo, questions: input.questions, answers: input.answers, status: input.status, createdAt: now()
    };
    this.clarificationRounds.set(record.id, record);
    this.persist();
    return record;
  }

  async updateClarificationRound(input: { id: string; answers: Array<{ questionId: string; answer: string }>; status: ClarificationRound["status"] }) {
    const record = this.clarificationRounds.get(input.id);
    if (record) { record.answers = input.answers; record.status = input.status; this.persist(); }
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
    this.persist();
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
    this.persist();
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
    this.persist();
  }

  async activateAiProvider(id: string) {
    for (const p of this.aiProviders.values()) p.isActive = p.id === id;
    this.persist();
  }

  async deactivateAllAiProviders() {
    for (const p of this.aiProviders.values()) p.isActive = false;
    this.persist();
  }

  async saveDesignDocument(input: { projectId: string; workflowId: string | null; type: DesignDocument["type"]; title: string; content: unknown }) {
    const timestamp = now();
    const record: DesignDocument = {
      id: id("dd"), projectId: input.projectId, workflowId: input.workflowId,
      type: input.type, title: input.title, content: input.content,
      version: 1, status: "draft", reviewResult: null, createdAt: timestamp, updatedAt: timestamp
    };
    this.designDocuments.set(record.id, record);
    this.persist();
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
      this.persist();
    }
  }

  async saveCodingTask(input: { projectId: string; workflowId: string | null; designDocId: string | null; files: CodingTask["files"]; traceability: CodingTask["traceability"]; agentRole: string }) {
    const record: CodingTask = {
      id: id("ct"), projectId: input.projectId, workflowId: input.workflowId,
      designDocId: input.designDocId, files: input.files, traceability: input.traceability,
      status: "generating", agentRole: input.agentRole, createdAt: now()
    };
    this.codingTasks.set(record.id, record);
    this.persist();
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
      this.persist();
    }
  }

  async saveTestRun(input: { projectId: string; workflowId: string | null; testPlan: unknown; testCases: TestRun["testCases"]; status: TestRun["status"] }) {
    const record: TestRun = {
      id: id("tr"), projectId: input.projectId, workflowId: input.workflowId,
      testPlan: input.testPlan, testCases: input.testCases, results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, error: 0 }, status: input.status, createdAt: now()
    };
    this.testRuns.set(record.id, record);
    this.persist();
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
      this.persist();
    }
  }

  async saveCodeReview(input: { projectId: string; workflowId: string | null; codeFiles: string[] }) {
    const record: CodeReviewRecord = {
      id: id("rv"), projectId: input.projectId, workflowId: input.workflowId,
      codeFiles: input.codeFiles, aiReview: [], humanComments: [],
      status: "pending", finalReport: null, createdAt: now()
    };
    this.codeReviews.set(record.id, record);
    this.persist();
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
      this.persist();
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
    this.persist();
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
      this.persist();
    }
  }
}
