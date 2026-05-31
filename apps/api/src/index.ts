import cors from "cors";
import express from "express";
import { z } from "zod";
import type { RequirementQuestion } from "@dev-platform/shared";
import { createStore } from "./store.js";

const port = Number(process.env.API_PORT ?? 3001);
const app = express();
const store = await createStore();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const now = () => new Date().toISOString();
const paramValue = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default("")
});

const requirementAnalyzeSchema = z.object({
  requirementText: z.string().min(1)
});

const asyncHandler =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dev-platform-api",
    store: store.kind,
    time: now()
  });
});

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

app.get(
  "/api/projects/:projectId/workflows",
  asyncHandler(async (req, res) => {
    const workflows = await store.listWorkflowsByProject(paramValue(req.params.projectId));
    res.json({ workflows });
  })
);

app.post(
  "/api/projects/:projectId/analyze-requirement",
  asyncHandler(async (req, res) => {
    const project = await store.getProject(paramValue(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const parsed = requirementAnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    const questions = generateMockRequirementQuestions(parsed.data.requirementText);
    const workflow = (await store.listWorkflowsByProject(project.id))[0] ?? null;
    const reflection = {
      score: 78,
      canContinue: false,
      blockingIssues: questions.filter((question) => question.priority === "blocking").map((question) => question.id),
      nextAction: "请录入业务反馈后进入澄清阶段"
    };

    if (workflow) {
      await store.updateWorkflowStage({
        workflowId: workflow.id,
        currentStage: "REQUIREMENT_QUESTIONING",
        status: "waiting"
      });
    }

    const analysis = await store.saveRequirementAnalysis({
      projectId: project.id,
      workflowId: workflow?.id ?? null,
      requirementText: parsed.data.requirementText,
      questions,
      reflection
    });

    res.json({
      id: analysis.id,
      stage: "REQUIREMENT_QUESTIONING",
      questions,
      reflection
    });
  })
);

app.get("/api/workflow-stages", (_req, res) => {
  res.json({
    stages: [
      "PROJECT_IMPORTED",
      "REQUIREMENT_ANALYZING",
      "REQUIREMENT_QUESTIONING",
      "CLARIFYING",
      "READY_FOR_SOLUTION",
      "SOLUTION_GENERATING",
      "SOLUTION_REVIEWING",
      "DETAIL_DESIGN_GENERATING",
      "DETAIL_DESIGN_REVIEWING",
      "CODING",
      "SELF_TESTING",
      "CODE_REVIEWING",
      "READY_TO_DELIVER",
      "DONE"
    ]
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "internal_server_error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} using ${store.kind} store`);
});

function generateMockRequirementQuestions(requirementText: string): RequirementQuestion[] {
  const hasPermission = /权限|角色|审批/.test(requirementText);
  const hasAcceptance = /验收|测试|通过|标准/.test(requirementText);

  return [
    {
      id: "Q-001",
      category: "business_rule",
      priority: "blocking",
      question: "该需求的核心业务规则是否存在例外场景或特殊处理分支？",
      whyNeeded: "业务规则的例外场景会直接影响方案设计、详细设计和代码实现范围。",
      impactScope: ["需求澄清", "方案设计", "编码任务"],
      candidateAnswers: ["没有例外场景", "存在少量例外场景", "需要按业务类型分别处理"]
    },
    {
      id: "Q-002",
      category: "permission",
      priority: hasPermission ? "high" : "medium",
      question: "哪些角色可以触发、审批或撤销该功能？",
      whyNeeded: "权限边界不明确会导致接口、页面和审计设计缺失。",
      impactScope: ["权限校验", "审批流程", "审计日志"],
      candidateAnswers: ["仅管理员", "项目负责人和管理员", "按业务角色配置"]
    },
    {
      id: "Q-003",
      category: "acceptance",
      priority: hasAcceptance ? "high" : "blocking",
      question: "该需求的验收标准是什么，哪些场景必须测试通过？",
      whyNeeded: "没有验收标准，AI 无法判断代码是否完成，也无法生成测试矩阵。",
      impactScope: ["测试矩阵", "自测阶段", "交付报告"],
      candidateAnswers: ["按正常流程验收", "正常和异常场景都要验收", "需要补充性能或安全指标"]
    }
  ];
}
