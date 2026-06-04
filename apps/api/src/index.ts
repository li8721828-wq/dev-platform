import cors from "cors";
import express from "express";
import { z } from "zod";
import type { GeneratedFile } from "@dev-platform/shared";
import { createStore } from "./store.js";
import { GitService } from "./git/git-service.js";
import { ClarificationService } from "./clarification/clarification-service.js";
import { ReflectionService } from "./reflection/reflection-service.js";
import { DesignService, type SolutionOutput } from "./design/design-service.js";
import { CodingService } from "./coding/coding-service.js";
import { TestingService } from "./testing/testing-service.js";
import { ReviewService } from "./review/review-service.js";
import { DeployService } from "./deploy/deploy-service.js";
import { createAiClient, getProvidersInfo, type AiProviderInstance } from "./ai/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(__dirname, "../../../storage/projects"));

const port = Number(process.env.API_PORT ?? 3001);
const app = express();
const store = await createStore();
const gitService = new GitService(storageRoot);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const now = () => new Date().toISOString();
const paramValue = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  gitUrl: z.string().optional()
});

const requirementAnalyzeSchema = z.object({
  requirementText: z.string().min(1)
});

const gitCloneSchema = z.object({
  gitUrl: z.string().min(1),
  branch: z.string().optional()
});

const clarificationAnswerSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string().min(1)
  }))
});

const aiProviderSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  model: z.string().min(1),
  isActive: z.boolean().default(true)
});

const asyncHandler =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

// 获取 AI 客户端（使用已配置的活跃提供商，或环境变量）
async function getAiClient(): Promise<{ client: ReturnType<typeof createAiClient> | null; error?: string }> {
  // 优先使用数据库中配置的活跃提供商
  const activeProvider = await store.getActiveAiProvider();
  if (activeProvider) {
    const instance: AiProviderInstance = {
      providerId: activeProvider.providerId,
      apiKey: activeProvider.apiKey,
      baseUrl: activeProvider.baseUrl,
      model: activeProvider.model
    };
    try {
      return { client: createAiClient(instance) };
    } catch (error) {
      return { client: null, error: `AI provider error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  // 回退到环境变量
  const envProviders = [
    { id: "openai", key: "OPENAI_API_KEY" },
    { id: "anthropic", key: "ANTHROPIC_API_KEY" },
    { id: "deepseek", key: "DEEPSEEK_API_KEY" },
    { id: "moonshot", key: "MOONSHOT_API_KEY" },
    { id: "qwen", key: "DASHSCOPE_API_KEY" },
    { id: "volcengine", key: "VOLCANO_ENGINE_API_KEY" },
    { id: "openrouter", key: "OPENROUTER_API_KEY" }
  ];

  for (const { id, key } of envProviders) {
    const apiKey = process.env[key];
    if (apiKey) {
      const { getProviderConfig } = await import("./ai/providers.js");
      const config = getProviderConfig(id);
      if (config) {
        try {
          return { client: createAiClient({ providerId: id, apiKey, baseUrl: config.baseUrl, model: config.defaultModel }) };
        } catch {
          continue;
        }
      }
    }
  }

  return { client: null, error: "未配置 AI 提供商，请先在设置中配置 API Key" };
}

// ========== Health ==========
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "dev-platform-api", store: store.kind, time: now() });
});

// ========== AI 提供商管理 ==========
app.get("/api/ai-providers", (_req, res) => {
  res.json({ providers: getProvidersInfo() });
});

app.post(
  "/api/ai-providers",
  asyncHandler(async (req, res) => {
    const parsed = aiProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    const provider = await store.saveAiProvider(parsed.data);
    res.status(201).json({ provider: { ...provider, apiKey: provider.apiKey ? "***" + provider.apiKey.slice(-4) : "" } });
  })
);

app.get(
  "/api/ai-providers/active",
  asyncHandler(async (_req, res) => {
    const provider = await store.getActiveAiProvider();
    if (!provider) {
      res.json({ provider: null });
      return;
    }
    res.json({ provider: { ...provider, apiKey: provider.apiKey ? "***" + provider.apiKey.slice(-4) : "" } });
  })
);

app.get(
  "/api/ai-providers/configured",
  asyncHandler(async (_req, res) => {
    const providers = await store.listAiProviders();
    res.json({ providers: providers.map((p) => ({ ...p, apiKey: p.apiKey ? "***" + p.apiKey.slice(-4) : "" })) });
  })
);

app.delete(
  "/api/ai-providers/:id",
  asyncHandler(async (req, res) => {
    const id = paramValue(req.params.id);
    await store.deleteAiProvider(id);
    res.json({ success: true });
  })
);

app.put(
  "/api/ai-providers/:id/activate",
  asyncHandler(async (req, res) => {
    const id = paramValue(req.params.id);
    const isActive = req.body.isActive ?? true;
    if (isActive) {
      await store.activateAiProvider(id);
    } else {
      await store.deactivateAllAiProviders();
    }
    const provider = (await store.listAiProviders()).find((p) => p.id === id);
    if (!provider) { res.status(404).json({ error: "provider_not_found" }); return; }
    res.json({ provider: { ...provider, apiKey: provider.apiKey ? "***" + provider.apiKey.slice(-4) : "" } });
  })
);

// 检测提供商可用模型
app.post(
  "/api/ai-providers/test-models",
  asyncHandler(async (req, res) => {
    const { providerId, apiKey, baseUrl } = req.body;
    if (!providerId || !apiKey) {
      res.status(400).json({ error: "providerId and apiKey are required" });
      return;
    }

    const { getProviderConfig } = await import("./ai/providers.js");
    const config = getProviderConfig(providerId);
    if (!config) {
      res.status(400).json({ error: "unknown_provider", message: `未知提供商: ${providerId}` });
      return;
    }

    const effectiveBaseUrl = baseUrl || config.baseUrl;

    try {
      if (config.apiType === "anthropic") {
        // Anthropic 没有公开的 models 列表 API，返回已知模型
        res.json({
          models: config.models,
          source: "known_list",
          message: "Anthropic 不提供模型列表 API，已返回已知模型"
        });
        return;
      }

      // OpenAI 兼容接口: 调用 /models 端点
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: apiKey || "ollama",
        baseURL: effectiveBaseUrl
      });

      const modelsPage = await client.models.list({ timeout: 10000 });
      const models: string[] = [];
      for await (const model of modelsPage) {
        if (model.id) models.push(model.id);
      }

      models.sort();
      res.json({ models, source: "api", count: models.length });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      // 如果 API 调用失败，返回已知模型作为回退
      res.json({
        models: config.models,
        source: "fallback",
        error: errMsg,
        message: `无法连接提供商 API，已返回默认模型列表。错误: ${errMsg}`
      });
    }
  })
);

// ========== 项目管理 ==========
app.get(
  "/api/projects",
  asyncHandler(async (_req, res) => {
    res.json({ projects: await store.listProjects() });
  })
);

app.post(
  "/api/projects",
  asyncHandler(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    const result = await store.createProject(parsed.data);
    res.status(201).json(result);
  })
);

// ========== Git 仓库操作 ==========
app.post(
  "/api/projects/:projectId/clone",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const parsed = gitCloneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const result = await gitService.clone(projectId, parsed.data.gitUrl, parsed.data.branch);
    if (!result.success) {
      res.status(400).json({ error: "clone_failed", message: result.message });
      return;
    }

    // 更新项目 Git 信息
    await store.updateProjectGitInfo(projectId, {
      gitUrl: parsed.data.gitUrl,
      repoPath: gitService.getRepoPath(projectId),
      defaultBranch: parsed.data.branch
    });

    res.json(result);
  })
);

app.get(
  "/api/projects/:projectId/tree",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const dirPath = typeof req.query.path === "string" ? req.query.path : "";

    if (!gitService.repoExists(projectId)) {
      res.status(404).json({ error: "repo_not_found", message: "请先克隆仓库" });
      return;
    }

    const tree = await gitService.getFileTree(projectId, dirPath);
    res.json({ tree });
  })
);

app.get(
  "/api/projects/:projectId/files",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const filePath = typeof req.query.path === "string" ? req.query.path : "";

    if (!filePath) {
      res.status(400).json({ error: "missing_path" });
      return;
    }

    const content = await gitService.readFileContent(projectId, filePath);
    if (!content) {
      res.status(404).json({ error: "file_not_found" });
      return;
    }

    res.json(content);
  })
);

app.get(
  "/api/projects/:projectId/branches",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const branches = await gitService.getBranches(projectId);
    res.json({ branches });
  })
);

app.get(
  "/api/projects/:projectId/status",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const status = await gitService.getStatus(projectId);
    if (!status) {
      res.status(404).json({ error: "repo_not_found" });
      return;
    }
    res.json(status);
  })
);

// ========== 工作流 ==========
app.get(
  "/api/projects/:projectId/workflows",
  asyncHandler(async (req, res) => {
    const workflows = await store.listWorkflowsByProject(paramValue(req.params.projectId));
    res.json({ workflows });
  })
);

// ========== 需求分析（真实 AI） ==========
app.post(
  "/api/projects/:projectId/analyze-requirement",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const parsed = requirementAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    // 获取 AI 客户端
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) {
      res.status(503).json({ error: "ai_not_configured", message: aiError });
      return;
    }

    // 调用 AI 分析需求
    const clarificationService = new ClarificationService(aiClient);
    const result = await clarificationService.analyzeRequirement(parsed.data.requirementText);

    // 获取工作流
    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;

    // 保存澄清轮次
    const round = await store.saveClarificationRound({
      projectId,
      workflowId: workflow?.id ?? null,
      roundNo: 1,
      questions: result.questions,
      answers: [],
      status: "pending"
    });

    // 保存需求分析记录
    const analysis = await store.saveRequirementAnalysis({
      projectId,
      workflowId: workflow?.id ?? null,
      requirementText: parsed.data.requirementText,
      questions: result.questions,
      reflection: { summary: result.summary }
    });

    // 更新工作流状态
    if (workflow) {
      await store.updateWorkflowStage({
        workflowId: workflow.id,
        currentStage: "REQUIREMENT_QUESTIONING",
        status: "waiting"
      });
    }

    res.json({
      id: analysis.id,
      roundId: round.id,
      stage: "REQUIREMENT_QUESTIONING",
      questions: result.questions,
      canStartDevelopment: result.canStartDevelopment,
      summary: result.summary
    });
  })
);

// ========== 澄清闭环 ==========
app.get(
  "/api/projects/:projectId/clarification-history",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const rounds = await store.listClarificationRounds(projectId);
    res.json({ rounds });
  })
);

app.post(
  "/api/clarifications/:roundId/answers",
  asyncHandler(async (req, res) => {
    const roundId = paramValue(req.params.roundId);
    const round = await store.getClarificationRound(roundId);
    if (!round) {
      res.status(404).json({ error: "round_not_found" });
      return;
    }

    const parsed = clarificationAnswerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    // 更新答案
    await store.updateClarificationRound({
      id: roundId,
      answers: parsed.data.answers,
      status: "answered"
    });

    res.json({ success: true, message: "答案已保存" });
  })
);

app.post(
  "/api/clarifications/:roundId/follow-up",
  asyncHandler(async (req, res) => {
    const roundId = paramValue(req.params.roundId);
    const round = await store.getClarificationRound(roundId);
    if (!round) {
      res.status(404).json({ error: "round_not_found" });
      return;
    }

    if (round.status === "pending") {
      res.status(400).json({ error: "round_not_answered", message: "请先录入业务反馈" });
      return;
    }

    // 获取 AI 客户端
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) {
      res.status(503).json({ error: "ai_not_configured", message: aiError });
      return;
    }

    // 获取原始需求
    const projectId = round.projectId;
    const analyses = await store.listProjects(); // 通过 store 获取需求文本
    // 简化处理：从澄清历史中获取
    const allRounds = await store.listClarificationRounds(projectId);

    const clarificationService = new ClarificationService(aiClient);

    // 获取原始需求文本（从第一轮分析中获取）
    const requirementText = req.body.requirementText || "请基于已澄清的内容继续追问。";

    const result = await clarificationService.generateFollowUp(
      requirementText,
      round.questions,
      round.answers
    );

    // 保存新一轮澄清
    const newRound = await store.saveClarificationRound({
      projectId,
      workflowId: round.workflowId,
      roundNo: round.roundNo + 1,
      questions: result.questions,
      answers: [],
      status: result.questions.length > 0 ? "pending" : "closed"
    });

    res.json({
      roundId: newRound.id,
      questions: result.questions,
      conflicts: result.conflicts,
      canContinue: result.canContinue,
      summary: result.summary
    });
  })
);

// ========== 反思报告 ==========
app.post(
  "/api/workflows/:workflowId/reflect",
  asyncHandler(async (req, res) => {
    const workflowId = paramValue(req.params.workflowId);

    // 获取 AI 客户端
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) {
      res.status(503).json({ error: "ai_not_configured", message: aiError });
      return;
    }

    const stage = req.body.stage || "REQUIREMENT_ANALYSIS";
    const requirementText = req.body.requirementText || "";
    const questions = req.body.questions || [];
    const answers = req.body.answers || [];

    const reflectionService = new ReflectionService(aiClient);
    const report = await reflectionService.generateReflection(stage, requirementText, questions, answers);

    // 保存反思报告
    const saved = await store.saveReflectionReport({
      workflowId,
      stage: report.stage,
      score: report.score,
      canContinue: report.canContinue,
      blockingIssues: report.blockingIssues,
      nonBlockingIssues: report.nonBlockingIssues,
      consistencyCheck: report.consistencyCheck,
      evidence: report.evidence,
      nextAction: report.nextAction,
      summary: report.summary
    });

    res.json(saved);
  })
);

app.get(
  "/api/reflections/:reportId",
  asyncHandler(async (req, res) => {
    const reportId = paramValue(req.params.reportId);
    const report = await store.getReflectionReport(reportId);
    if (!report) {
      res.status(404).json({ error: "report_not_found" });
      return;
    }
    res.json(report);
  })
);

// ========== 工作流阶段 ==========
app.get("/api/workflow-stages", (_req, res) => {
  res.json({
    stages: [
      "PROJECT_IMPORTED", "REQUIREMENT_ANALYZING", "REQUIREMENT_QUESTIONING",
      "CLARIFYING", "READY_FOR_SOLUTION", "SOLUTION_GENERATING",
      "SOLUTION_REVIEWING", "DETAIL_DESIGN_GENERATING", "DETAIL_DESIGN_REVIEWING",
      "CODING", "SELF_TESTING", "CODE_REVIEWING", "READY_TO_DELIVER", "DONE"
    ]
  });
});

// ========== 方案设计 ==========
app.post(
  "/api/projects/:projectId/generate-solution",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const requirementText = req.body.requirementText ?? "";
    const clarifications = req.body.clarifications ?? [];
    const existingFiles = req.body.existingFiles ?? [];

    const designService = new DesignService(aiClient);
    const solution = await designService.generateSolution(requirementText, clarifications, {
      projectName: project.name,
      existingFiles
    });

    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;
    const saved = await store.saveDesignDocument({
      projectId,
      workflowId: workflow?.id ?? null,
      type: "solution",
      title: solution.title,
      content: solution
    });

    if (workflow) {
      await store.updateWorkflowStage({ workflowId: workflow.id, currentStage: "SOLUTION_GENERATING", status: "running" });
    }

    res.json(saved);
  })
);

app.post(
  "/api/projects/:projectId/generate-detail-design",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const solutionDocId = req.body.solutionDocId;
    const requirementText = req.body.requirementText ?? "";
    const clarifications = req.body.clarifications ?? [];

    if (!solutionDocId) { res.status(400).json({ error: "solutionDocId is required" }); return; }
    const solutionDoc = await store.getDesignDocument(solutionDocId);
    if (!solutionDoc) { res.status(404).json({ error: "solution_not_found" }); return; }

    const designService = new DesignService(aiClient);
    const solutionContent = solutionDoc.content as Record<string, unknown>;
    const detailDesign = await designService.generateDetailDesign(
      solutionContent as unknown as SolutionOutput, requirementText, clarifications
    );

    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;
    const saved = await store.saveDesignDocument({
      projectId,
      workflowId: workflow?.id ?? null,
      type: "detail_design",
      title: detailDesign.title,
      content: detailDesign
    });

    if (workflow) {
      await store.updateWorkflowStage({ workflowId: workflow.id, currentStage: "DETAIL_DESIGN_GENERATING", status: "running" });
    }

    res.json(saved);
  })
);

app.get(
  "/api/projects/:projectId/designs",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const docs = await store.listDesignDocuments(projectId);
    res.json({ documents: docs });
  })
);

app.get(
  "/api/designs/:docId",
  asyncHandler(async (req, res) => {
    const doc = await store.getDesignDocument(paramValue(req.params.docId));
    if (!doc) { res.status(404).json({ error: "document_not_found" }); return; }
    res.json(doc);
  })
);

app.post(
  "/api/designs/:docId/review",
  asyncHandler(async (req, res) => {
    const docId = paramValue(req.params.docId);
    const doc = await store.getDesignDocument(docId);
    if (!doc) { res.status(404).json({ error: "document_not_found" }); return; }

    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const requirementText = req.body.requirementText ?? "";
    const designService = new DesignService(aiClient);
    const reviewResult = await designService.reviewDesign(doc.content, doc.type, requirementText);

    await store.updateDesignDocument({
      id: docId,
      status: reviewResult.score >= 70 ? "approved" : "rejected",
      reviewResult
    });

    res.json(reviewResult);
  })
);

// ========== 单 Agent 编码 ==========
app.post(
  "/api/projects/:projectId/generate-code",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const designDocId = req.body.designDocId;
    const requirementText = req.body.requirementText ?? "";
    const clarifications = req.body.clarifications ?? [];

    if (!designDocId) { res.status(400).json({ error: "designDocId is required" }); return; }
    const designDoc = await store.getDesignDocument(designDocId);
    if (!designDoc) { res.status(404).json({ error: "design_not_found" }); return; }

    const project = await store.getProject(projectId);
    const codingService = new CodingService(aiClient);
    const result = await codingService.generateCode(
      designDoc.content, requirementText, clarifications,
      { projectName: project?.name ?? "" }
    );

    // 生成追溯矩阵
    const traceability = await codingService.generateTraceability(
      requirementText, clarifications, designDoc.content, result.files
    );

    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;
    const codingTask = await store.saveCodingTask({
      projectId,
      workflowId: workflow?.id ?? null,
      designDocId,
      files: result.files,
      traceability,
      agentRole: "coder"
    });

    if (workflow) {
      await store.updateWorkflowStage({ workflowId: workflow.id, currentStage: "CODING", status: "running" });
    }

    res.json(codingTask);
  })
);

app.post(
  "/api/projects/:projectId/apply-code",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const codingTaskId = req.body.codingTaskId;
    if (!codingTaskId) { res.status(400).json({ error: "codingTaskId is required" }); return; }

    const task = await store.getCodingTask(codingTaskId);
    if (!task) { res.status(404).json({ error: "coding_task_not_found" }); return; }

    const repoPath = gitService.getRepoPath(projectId);
    if (!repoPath) { res.status(400).json({ error: "repo_not_found", message: "请先克隆仓库" }); return; }

    const { client: aiClient } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured" }); return; }

    const codingService = new CodingService(aiClient);
    const result = await codingService.applyCode(repoPath, task.files);

    await store.updateCodingTask({ id: codingTaskId, status: "applied", appliedAt: now() });

    res.json(result);
  })
);

app.get(
  "/api/projects/:projectId/coding-tasks",
  asyncHandler(async (req, res) => {
    const tasks = await store.listCodingTasks(paramValue(req.params.projectId));
    res.json({ tasks });
  })
);

app.get(
  "/api/projects/:projectId/traceability",
  asyncHandler(async (req, res) => {
    const tasks = await store.listCodingTasks(paramValue(req.params.projectId));
    const allTraceability = tasks.flatMap(t => t.traceability);
    res.json({ traceability: allTraceability });
  })
);

// ========== 自动测试 ==========
app.post(
  "/api/projects/:projectId/generate-tests",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const requirementText = req.body.requirementText ?? "";
    const designDocId = req.body.designDocId;
    const codeFiles = req.body.codeFiles ?? [];

    let design = null;
    if (designDocId) {
      const doc = await store.getDesignDocument(designDocId);
      design = doc?.content;
    }

    const testingService = new TestingService(aiClient);
    const result = await testingService.generateTestPlan(requirementText, design, codeFiles);

    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;
    const testRun = await store.saveTestRun({
      projectId,
      workflowId: workflow?.id ?? null,
      testPlan: result.testPlan,
      testCases: result.testCases,
      status: "generating"
    });

    res.json(testRun);
  })
);

app.post(
  "/api/projects/:projectId/run-tests",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const testRunId = req.body.testRunId;
    if (!testRunId) { res.status(400).json({ error: "testRunId is required" }); return; }

    const testRun = await store.getTestRun(testRunId);
    if (!testRun) { res.status(404).json({ error: "test_run_not_found" }); return; }

    // 通过 runner 服务执行测试
    const runnerUrl = process.env.RUNNER_URL ?? "http://localhost:3011";
    const command = req.body.command ?? "npm test";

    try {
      // 标记为运行中
      await store.updateTestRun({
        id: testRunId,
        status: "running",
        results: [],
        summary: { total: testRun.testCases.length, passed: 0, failed: 0, skipped: 0, error: 0 }
      });

      const response = await fetch(`${runnerUrl}/runner/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, command, timeoutSeconds: 300 })
      });

      if (!response.ok) throw new Error(`Runner returned ${response.status}`);
      const jobResult = await response.json();

      // 根据 runner 返回结果更新测试状态
      const passed = jobResult.exitCode === 0;
      await store.updateTestRun({
        id: testRunId,
        status: "completed",
        results: testRun.testCases.map(tc => ({
          testCaseId: tc.id,
          status: passed ? "passed" as const : "failed" as const,
          duration: jobResult.duration ?? 0
        })),
        summary: {
          total: testRun.testCases.length,
          passed: passed ? testRun.testCases.length : 0,
          failed: passed ? 0 : testRun.testCases.length,
          skipped: 0,
          error: 0
        },
        analysis: jobResult.stdout?.slice(0, 500) ?? "",
        completedAt: now()
      });

      res.json({ job: jobResult, testRunId, status: "completed" });
    } catch (error) {
      await store.updateTestRun({
        id: testRunId,
        status: "failed",
        analysis: `Runner 执行失败: ${error instanceof Error ? error.message : String(error)}`,
        completedAt: now()
      });
      res.status(502).json({ error: "runner_unavailable", message: `测试执行失败: ${error instanceof Error ? error.message : String(error)}` });
    }
  })
);

app.get(
  "/api/projects/:projectId/test-runs",
  asyncHandler(async (req, res) => {
    const runs = await store.listTestRuns(paramValue(req.params.projectId));
    res.json({ testRuns: runs });
  })
);

app.get(
  "/api/test-runs/:runId",
  asyncHandler(async (req, res) => {
    const run = await store.getTestRun(paramValue(req.params.runId));
    if (!run) { res.status(404).json({ error: "test_run_not_found" }); return; }
    res.json(run);
  })
);

// ========== 代码审查 ==========
app.post(
  "/api/projects/:projectId/ai-review",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const codeFiles = req.body.codeFiles ?? [];
    const designDocId = req.body.designDocId;
    const requirements = req.body.requirements ?? "";

    let design = null;
    if (designDocId) {
      const doc = await store.getDesignDocument(designDocId);
      design = doc?.content;
    }

    // 如果没有传入代码文件，自动从仓库读取
    let filesForReview = codeFiles;
    if (filesForReview.length === 0) {
      const repoPath = gitService.getRepoPath(projectId);
      if (repoPath) {
        try {
          const tree = await gitService.getFileTree(projectId, "", 5);
          const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs", ".vue", ".svelte"];
          
          // 递归提取所有文件节点
          const allFiles: Array<{ name: string; path: string }> = [];
          function flatten(nodes: Array<{ name: string; path: string; type: string; children?: Array<{ name: string; path: string; type: string; children?: unknown[] }> }>) {
            for (const node of nodes) {
              if (node.type === "file") allFiles.push(node);
              else if ((node as any).children) flatten((node as any).children);
            }
          }
          flatten(tree as any);
          
          const sourceFiles = allFiles.filter(f => sourceExtensions.some(ext => f.name.endsWith(ext)));
          
          for (const file of sourceFiles.slice(0, 15)) {
            const content = await gitService.readFileContent(projectId, file.path);
            if (content) {
              filesForReview.push({ path: file.path, content: content.content, language: "", description: "" });
            }
          }
        } catch { /* 读取失败时继续，使用空文件列表 */ }
      }
    }

    if (filesForReview.length === 0) {
      res.status(400).json({ error: "no_code_files", message: "没有可审查的代码文件，请先克隆仓库或生成代码" });
      return;
    }

    const reviewService = new ReviewService(aiClient);
    const aiReviewResult = await reviewService.aiReview(filesForReview as GeneratedFile[], design, requirements);

    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;
    const codeReview = await store.saveCodeReview({
      projectId,
      workflowId: workflow?.id ?? null,
      codeFiles: filesForReview.map((f: GeneratedFile) => f.path)
    });

    await store.updateCodeReview({
      id: codeReview.id,
      aiReview: aiReviewResult.issues,
      status: "ai_reviewed"
    });

    res.json({ reviewId: codeReview.id, ...aiReviewResult });
  })
);

app.post(
  "/api/code-reviews/:reviewId/human-comments",
  asyncHandler(async (req, res) => {
    const reviewId = paramValue(req.params.reviewId);
    const review = await store.getCodeReview(reviewId);
    if (!review) { res.status(404).json({ error: "review_not_found" }); return; }

    const newComment = {
      id: `hc_${Date.now()}`,
      reviewer: req.body.reviewer ?? "anonymous",
      file: req.body.file,
      line: req.body.line,
      content: req.body.content ?? "",
      resolved: false,
      createdAt: now()
    };

    const updatedComments = [...review.humanComments, newComment];
    await store.updateCodeReview({
      id: reviewId,
      humanComments: updatedComments,
      status: "human_reviewing"
    });

    res.json({ comment: newComment });
  })
);

app.post(
  "/api/code-reviews/:reviewId/finalize",
  asyncHandler(async (req, res) => {
    const reviewId = paramValue(req.params.reviewId);
    const review = await store.getCodeReview(reviewId);
    if (!review) { res.status(404).json({ error: "review_not_found" }); return; }

    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const reviewService = new ReviewService(aiClient);
    const finalReport = await reviewService.generateReviewReport(
      { issues: review.aiReview, overallScore: 0, summary: "", highlights: [] },
      review.humanComments
    );

    await store.updateCodeReview({
      id: reviewId,
      finalReport,
      status: "finalized",
      finalizedAt: now()
    });

    res.json(finalReport);
  })
);

app.get(
  "/api/projects/:projectId/code-reviews",
  asyncHandler(async (req, res) => {
    const reviews = await store.listCodeReviews(paramValue(req.params.projectId));
    res.json({ reviews });
  })
);

// ========== 部署配置 ==========
app.post(
  "/api/projects/:projectId/generate-deploy-config",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) { res.status(503).json({ error: "ai_not_configured", message: aiError }); return; }

    const existingFiles = req.body.existingFiles ?? [];
    const requirements = req.body.requirements;

    const deployService = new DeployService(aiClient);
    const config = await deployService.generateDeployConfig(
      { projectName: project.name, existingFiles },
      requirements
    );

    const saved = await store.saveDeployConfig({
      projectId,
      dockerfile: config.dockerfile,
      dockerCompose: config.dockerCompose,
      envVars: config.envVars,
      buildCommand: config.buildCommand,
      startCommand: config.startCommand
    });

    res.json(saved);
  })
);

app.get(
  "/api/projects/:projectId/deploy-config",
  asyncHandler(async (req, res) => {
    const config = await store.getDeployConfig(paramValue(req.params.projectId));
    if (!config) { res.status(404).json({ error: "deploy_config_not_found" }); return; }
    res.json(config);
  })
);

app.put(
  "/api/projects/:projectId/deploy-config",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    await store.updateDeployConfig({
      projectId,
      dockerfile: req.body.dockerfile,
      dockerCompose: req.body.dockerCompose,
      envVars: req.body.envVars,
      buildCommand: req.body.buildCommand,
      startCommand: req.body.startCommand
    });
    const config = await store.getDeployConfig(projectId);
    res.json(config);
  })
);

app.post(
  "/api/projects/:projectId/validate-deploy",
  asyncHandler(async (req, res) => {
    const deployService = new DeployService(null as unknown as import("./ai/client.js").AiClient);
    const result = deployService.validateDeployConfig(req.body);
    res.json(result);
  })
);

// ========== 文件保存 ==========
app.put(
  "/api/projects/:projectId/files",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const filePath = req.body.path;
    const content = req.body.content;

    if (!filePath || content === undefined) {
      res.status(400).json({ error: "path and content are required" });
      return;
    }

    const repoPath = gitService.getRepoPath(projectId);
    if (!repoPath) { res.status(400).json({ error: "repo_not_found" }); return; }

    const fs = await import("node:fs/promises");
    const pathModule = await import("node:path");
    const fullPath = pathModule.join(repoPath, filePath);
    const dir = pathModule.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");

    res.json({ success: true, path: filePath });
  })
);

// ========== Error Handler ==========
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "internal_server_error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} using ${store.kind} store`);
});
