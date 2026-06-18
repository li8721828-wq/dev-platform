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
import { FileReaderService } from "./requirement/file-reader-service.js";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageRoot = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(__dirname, "../../../storage/projects"));

const port = Number(process.env.API_PORT ?? 3001);
const app = express();
const store = await createStore();
const gitService = new GitService(storageRoot);
const fileReaderService = new FileReaderService();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const now = () => new Date().toISOString();
const paramValue = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  gitUrl: z.string().optional(),
  gitBranch: z.string().optional(),
  localPath: z.string().optional()
});

const requirementAnalyzeSchema = z.object({
  requirementText: z.string().min(1)
});

const requirementMaterialSchema = z.object({
  type: z.enum(["requirement", "reference"]),
  paths: z.array(z.string().min(1)).min(1)
});

const gitCloneSchema = z.object({
  gitUrl: z.string().min(1),
  branch: z.string().optional()
});

const importLocalSchema = z.object({
  localPath: z.string().min(1)
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

    // 如果提供了本地路径，自动导入
    if (parsed.data.localPath) {
      const linkResult = await gitService.linkLocal(result.project.id, parsed.data.localPath, parsed.data.gitBranch);
      if (linkResult.success) {
        await store.updateProjectGitInfo(result.project.id, {
          repoPath: gitService.getRepoPath(result.project.id),
          defaultBranch: parsed.data.gitBranch
        });
      } else {
        res.status(201).json({ ...result, importWarning: linkResult.message });
        return;
      }
    }

    // 如果提供了 Git URL，自动克隆
    if (parsed.data.gitUrl && !parsed.data.localPath) {
      const cloneResult = await gitService.clone(result.project.id, parsed.data.gitUrl, parsed.data.gitBranch);
      if (cloneResult.success) {
        await store.updateProjectGitInfo(result.project.id, {
          gitUrl: parsed.data.gitUrl,
          repoPath: gitService.getRepoPath(result.project.id),
          defaultBranch: parsed.data.gitBranch
        });
      } else {
        res.status(201).json({ ...result, importWarning: `克隆失败: ${cloneResult.message}` });
        return;
      }
    }

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

// ========== 本地路径导入 ==========
app.post(
  "/api/projects/:projectId/import-local",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const parsed = importLocalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const result = await gitService.linkLocal(projectId, parsed.data.localPath);
    if (!result.success) {
      res.status(400).json({ error: "import_failed", message: result.message });
      return;
    }

    // 更新项目 Git 信息（复用此字段存储 repoPath）
    await store.updateProjectGitInfo(projectId, {
      repoPath: gitService.getRepoPath(projectId)
    });

    res.json(result);
  })
);

// ========== AI 项目分析 ==========
app.post(
  "/api/projects/:projectId/analyze-project",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    if (!gitService.repoExists(projectId)) {
      res.status(400).json({ error: "no_code", message: "请先导入项目代码" });
      return;
    }

    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) {
      res.status(503).json({ error: "ai_not_configured", message: aiError });
      return;
    }

    // 读取文件树
    const tree = await gitService.getFileTree(projectId, "", 4);

    // 扁平化文件树，收集所有文件
    const allFiles: Array<{ name: string; path: string }> = [];
    function flatten(nodes: Array<{ name: string; path: string; type: string; children?: any[] }>) {
      for (const node of nodes) {
        if (node.type === "file") allFiles.push(node);
        else if (node.children) flatten(node.children);
      }
    }
    flatten(tree as any);

    // 选择关键文件读取
    const keyFileNames = [
      "README.md", "readme.md", "README.txt",
      "package.json", "Cargo.toml", "go.mod", "pom.xml", "build.gradle",
      "requirements.txt", "Pipfile", "pyproject.toml",
      "docker-compose.yml", "Dockerfile"
    ];
    const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"];

    const filesToRead: Array<{ name: string; path: string }> = [];

    // 优先读取配置文件和 README
    for (const keyName of keyFileNames) {
      const found = allFiles.find(f => f.name === keyName);
      if (found && filesToRead.length < 8) filesToRead.push(found);
    }

    // 再读取一些源码文件
    const srcFiles = allFiles
      .filter(f => sourceExtensions.some(ext => f.name.endsWith(ext)))
      .slice(0, 10);
    for (const f of srcFiles) {
      if (filesToRead.length < 18) filesToRead.push(f);
    }

    // 读取文件内容
    let fileContexts = "";
    for (const file of filesToRead) {
      try {
        const content = await gitService.readFileContent(projectId, file.path);
        if (content) {
          const truncated = content.content.length > 2000
            ? content.content.slice(0, 2000) + "\n... (truncated)"
            : content.content;
          fileContexts += `\n--- ${file.path} ---\n${truncated}\n`;
        }
      } catch { /* skip */ }
    }

    const treeText = JSON.stringify(tree, null, 2).slice(0, 5000);

    const messages = [
      {
        role: "system" as const,
        content: `你是一个资深软件架构师。请根据提供的项目文件结构和关键文件内容，生成一份专业、详细的项目介绍文档。

**输出格式要求：**
- 使用标准 Markdown 格式
- 用二级标题（##）分隔各个部分
- 使用列表、表格、代码块等 Markdown 语法来增强可读性

**架构图规范（用 \`\`\`architecture-json 代码块）：**
必须生成一个 \`\`\`architecture-json 代码块。

**核心原则：这必须是代码架构图，不是概念架构图。** 节点名称必须来自实际代码中的目录名、模块名、文件名、类名，不要使用“展示层”“服务层”这类抽象名称。

层名称应反映实际代码的分组方式，例如：
- “前端页面”、“React 组件”、“路由与入口”
- “API 路由”、“核心服务”、“中间件”
- “数据模型”、“存储引擎”、“缓存层”
- “构建工具”、“部署配置”、“CI/CD”

**JSON 格式：**
\`\`\`architecture-json
{
  "layers": [
    {
      "name": "前端入口",
      "color": "#6366f1",
      "nodes": [
        { "id": "main_tsx", "label": "main.tsx", "type": "module" },
        { "id": "app", "label": "App.tsx", "type": "module" }
      ]
    },
    {
      "name": "核心服务",
      "color": "#0891b2",
      "nodes": [
        { "id": "user_svc", "label": "UserService", "type": "service" },
        { "id": "auth_mw", "label": "AuthMiddleware", "type": "gateway" }
      ]
    },
    {
      "name": "数据模型",
      "color": "#059669",
      "nodes": [
        { "id": "user_model", "label": "UserModel", "type": "database" },
        { "id": "store", "label": "MemoryStore", "type": "database" }
      ]
    }
  ],
  "connections": [
    { "from": "main_tsx", "to": "app", "label": "渲染" },
    { "from": "app", "to": "user_svc", "label": "fetch" },
    { "from": "auth_mw", "to": "user_svc", "label": "校验" },
    { "from": "user_svc", "to": "user_model", "label": "查询" },
    { "from": "user_svc", "to": "store", "label": "读写" }
  ]
}
\`\`\`

**规则：**
- 必须有 3-5 层，每层 2-5 个节点，总计 10-18 个节点
- 每层颜色不同（推荐：#6366f1 紫, #0891b2 青, #059669 绿, #d97706 橙, #dc2626 红, #7c3aed 紫蓝）
- \`type\`：\`service\`(服务) / \`module\`(模块) / \`gateway\`(网关/中间件) / \`database\`(数据/存储) / \`infra\`(基础设施) / \`external\`(外部服务)
- **节点名称规则（严格遵守）：**
  - 名称必须来自实际代码：目录名、文件名、类名、模块名
  - label 最多 15 个字符，超长名称请截断或使用缩写（如 UserService、AuthMW、main.tsx）
  - 不要用“展示层”“服务层”等抽象名称作为节点
- **连线规则（严格遵守）：**
  - 总连线数控制在 6-10 条，只展示核心数据流
  - 只允许相邻层连接，绝对禁止跨层（如第 1 层不能直接连第 3 层）
  - 每个节点出线不超过 2 条
  - 标签 1-4 个字，如「HTTP」「fetch」「import」「ORM」
  - 允许同层内节点连接（虚线样式）
  - 禁止重复连线
- 根据实际代码分析，不要生搬硬套示例

**文档结构：**

## 📦 项目概述
用 3-5 句话详细描述项目的核心用途、目标用户、解决的核心问题和主要价值。

## 🛠️ 技术栈
用表格形式详细列出（包含分类、技术名称、用途三列）：
| 分类 | 技术 | 用途 |
|------|------|------|
列出所有能识别到的技术、框架、工具和关键依赖。

## 🏗️ 项目架构
先输出 \`\`\`architecture-json 代码块，然后在图表下方用文字详细说明：
- 各代码分组的职责和包含的实际模块
- 模块间的依赖关系、数据流向和通信方式（结合代码中的 import/require 关系）
- 关键设计模式和架构决策（结合具体文件说明）

## ⚡ 核心功能
用列表详细说明每个主要功能模块，包括：
- 模块名称
- 功能描述（2-3 句话）
- 关键文件/目录

## 📁 目录结构
用树形结构说明主要目录和文件的用途，对关键文件补充简要说明。

**注意事项：**
- 内容要专业、准确、详尽
- 不要猜测，只根据实际提供的信息分析
- 如果某些信息无法确定，标注「未知」并说明原因
- 直接输出 Markdown，不要包裹在代码块中`
      },
      {
        role: "user" as const,
        content: `项目名称：${project.name}
项目说明：${project.description || "无"}

目录结构：
${treeText}

关键文件内容：
${fileContexts || "无法读取文件内容"}`
      }
    ];

    try {
      const aiResponse = await aiClient.chat(messages, { temperature: 0.3, maxTokens: 4000 });
      res.json({ description: aiResponse.content });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "ai_analysis_failed", message: `AI 分析失败: ${errMsg}` });
    }
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

// ========== 需求材料管理 ==========
// 添加材料路径
app.post(
  "/api/projects/:projectId/requirement-materials",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const parsed = requirementMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const { type, paths } = parsed.data;

    // 读取文件
    const files = await fileReaderService.readPaths(paths);

    // 转换为材料记录
    const materials = files.map(f => ({
      id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      filePath: f.path,
      fileName: f.name,
      format: f.format,
      status: f.format === "error" ? "error" as const : "success" as const,
      contentPreview: f.content.substring(0, 5000),
      error: f.format === "error" ? f.content : undefined,
      addedAt: new Date().toISOString()
    }));

    await store.saveRequirementMaterials(projectId, materials);
    res.json({ materials });
  })
);

// 获取材料列表
app.get(
  "/api/projects/:projectId/requirement-materials",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materials = await store.listRequirementMaterials(projectId);
    res.json({ materials });
  })
);

// 删除材料
app.delete(
  "/api/projects/:projectId/requirement-materials/:materialId",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materialId = paramValue(req.params.materialId);
    await store.deleteRequirementMaterial(projectId, materialId);
    res.json({ success: true });
  })
);

// 读取材料完整内容
app.get(
  "/api/projects/:projectId/requirement-materials/:materialId/content",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materialId = paramValue(req.params.materialId);
    const materials = await store.listRequirementMaterials(projectId);
    const material = materials.find(m => m.id === materialId);
    if (!material) {
      res.status(404).json({ error: "material_not_found" });
      return;
    }

    // 重新读取文件获取完整内容
    const files = await fileReaderService.readPaths([material.filePath]);
    const file = files[0];
    if (!file || file.format === "error") {
      res.status(400).json({ error: "file_read_error", message: file?.content || "无法读取文件" });
      return;
    }

    res.json({ content: file.content, fileName: file.name, format: file.format, size: file.size, contentType: file.contentType || "text" });
  })
);

// PDF 文件流传输（用于 iframe 预览）
app.get(
  "/api/projects/:projectId/requirement-materials/:materialId/raw",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materialId = paramValue(req.params.materialId);
    const materials = await store.listRequirementMaterials(projectId);
    const material = materials.find(m => m.id === materialId);
    if (!material) {
      res.status(404).json({ error: "material_not_found" });
      return;
    }

    const ext = path.extname(material.filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml"
    };

    const mime = mimeTypes[ext] || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(material.fileName)}"`);
    const { createReadStream } = await import("node:fs");
    createReadStream(material.filePath).pipe(res);
  })
);

// 获取材料中嵌入的文件列表
app.get(
  "/api/projects/:projectId/requirement-materials/:materialId/embedded",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materialId = paramValue(req.params.materialId);
    const materials = await store.listRequirementMaterials(projectId);
    const material = materials.find(m => m.id === materialId);
    if (!material) {
      res.status(404).json({ error: "material_not_found" });
      return;
    }

    const ext = path.extname(material.filePath).toLowerCase();
    if (ext !== ".docx" && ext !== ".doc") {
      res.json({ embedded: [] });
      return;
    }

    try {
      const AdmZip = (await import("adm-zip")).default;
      const cfb = await import("cfb");
      const zip = new AdmZip(material.filePath);
      const entries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith("word/embeddings/") && !e.entryName.endsWith(".rels"));

      const embedded = [];
      for (let i = 0; i < entries.length; i++) {
        const result = await fileReaderService.extractEmbeddedFileData(material.filePath, i);
        if (result) {
          embedded.push({ index: i, fileName: result.fileName, format: result.format, size: result.data.length });
        }
      }

      res.json({ embedded });
    } catch (err) {
      res.status(500).json({ error: "extract_failed", message: String(err) });
    }
  })
);

// 下载嵌入的文件
app.get(
  "/api/projects/:projectId/requirement-materials/:materialId/embedded/:index",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materialId = paramValue(req.params.materialId);
    const embedIdx = parseInt(paramValue(req.params.index), 10);
    const materials = await store.listRequirementMaterials(projectId);
    const material = materials.find(m => m.id === materialId);
    if (!material) {
      res.status(404).json({ error: "material_not_found" });
      return;
    }

    const result = await fileReaderService.extractEmbeddedFileData(material.filePath, embedIdx);
    if (!result) {
      res.status(404).json({ error: "embedded_not_found" });
      return;
    }

    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(result.fileName)}"`);
    res.send(result.data);
  })
);

// 嵌入文件在线预览（Excel 转 HTML 表格）
app.get(
  "/api/projects/:projectId/requirement-materials/:materialId/embedded/:index/preview",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const materialId = paramValue(req.params.materialId);
    const embedIdx = parseInt(paramValue(req.params.index), 10);
    const materials = await store.listRequirementMaterials(projectId);
    const material = materials.find(m => m.id === materialId);
    if (!material) {
      res.status(404).json({ error: "material_not_found" });
      return;
    }

    const extracted = await fileReaderService.extractEmbeddedFileData(material.filePath, embedIdx);
    if (!extracted) {
      res.status(404).json({ error: "embedded_not_found" });
      return;
    }

    const { data, fileName, format } = extracted;
    const embedUrl = `/api/projects/${projectId}/requirement-materials/${materialId}/embedded/${embedIdx}`;

    // Excel: 转为 HTML 表格
    if ([".xlsx", ".xls"].includes(format)) {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(data, { type: "buffer" });
        const sheets: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(sheet);
          sheets.push(`<div class="sheet-title">Sheet: ${sheetName}</div>${html}`);
        }
        res.json({ type: "table", html: sheets.join("\n"), fileName });
      } catch (err) {
        res.json({ type: "error", message: `Excel 解析失败: ${err instanceof Error ? err.message : String(err)}` });
      }
      return;
    }

    // 文本格式 - 自动检测编码（优先 GBK）
    const textExts = [".xml", ".json", ".txt", ".md", ".csv", ".html", ".htm", ".sql", ".yaml", ".yml"];
    if (textExts.includes(format)) {
      let content = "";
      // 检查是否包含非 ASCII 字节（可能是 GBK）
      const hasHighBytes = (() => {
        // 扫描整个文件（OLE嵌入文件可能前面全是 ASCII，中文在后面）
        for (let i = 0; i < data.length; i++) {
          if (data[i] > 0x7f) return true;
        }
        return false;
      })();

      if (hasHighBytes) {
        // 有非 ASCII 字节，尝试 GBK 解码
        try {
          const iconvModule = await import("iconv-lite");
          const iconv = (iconvModule as any).default || iconvModule;
          content = iconv.decode(data, "gbk");
        } catch (e) {
          content = data.toString("utf-8");
        }
      } else {
        content = data.toString("utf-8");
      }
      res.json({ type: "text", content, fileName });
      return;
    }

    // PDF/图片
    res.json({ type: format === ".pdf" ? "pdf" : "image", url: embedUrl, fileName });
  })
);

// AI 分析所有材料
app.post(
  "/api/projects/:projectId/analyze-materials",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const project = await store.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const { client: aiClient, error: aiError } = await getAiClient();
    if (!aiClient) {
      res.status(503).json({ error: "ai_not_configured", message: aiError });
      return;
    }

    // 获取所有材料
    const materials = await store.listRequirementMaterials(projectId);
    if (materials.length === 0) {
      res.status(400).json({ error: "no_materials", message: "请先添加需求文档或参考资料" });
      return;
    }

    // 重新读取所有文件内容
    const allPaths = materials.filter(m => m.status === "success").map(m => m.filePath);
    const files = await fileReaderService.readPaths(allPaths);

    const reqFiles = files.filter((_, i) => materials.filter(m => m.status === "success")[i]?.type === "requirement");
    const refFiles = files.filter((_, i) => materials.filter(m => m.status === "success")[i]?.type === "reference");

    // AI 分析
    const clarificationService = new ClarificationService(aiClient);
    const result = await clarificationService.analyzeRequirementMaterials(reqFiles, refFiles);

    // 保存分析结果
    const analysisResult = {
      id: `analysis_${Date.now()}`,
      projectId,
      materials,
      aiSummary: result.aiSummary,
      questions: result.questions,
      status: "completed" as const,
      createdAt: new Date().toISOString()
    };
    await store.saveRequirementAnalysisResult(analysisResult);

    // 保存澄清轮次
    const workflow = (await store.listWorkflowsByProject(projectId))[0] ?? null;
    await store.saveClarificationRound({
      projectId,
      workflowId: workflow?.id ?? null,
      roundNo: 1,
      questions: result.questions,
      answers: [],
      status: "pending"
    });

    res.json(analysisResult);
  })
);

// 获取最新分析结果
app.get(
  "/api/projects/:projectId/requirement-analysis",
  asyncHandler(async (req, res) => {
    const projectId = paramValue(req.params.projectId);
    const result = await store.getLatestRequirementAnalysis(projectId);
    res.json({ result });
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
