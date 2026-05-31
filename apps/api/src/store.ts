import { randomUUID } from "node:crypto";
import pg from "pg";
import type { ProjectSummary, RequirementQuestion, WorkflowSummary } from "@dev-platform/shared";

const { Pool } = pg;

export interface RequirementAnalysisRecord {
  id: string;
  projectId: string;
  workflowId: string | null;
  requirementText: string;
  questions: RequirementQuestion[];
  reflection: unknown;
  createdAt: string;
}

export interface AppStore {
  kind: "postgres" | "memory";
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
  createProject(input: { name: string; description: string }): Promise<{ project: ProjectSummary; workflow: WorkflowSummary }>;
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
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export async function createStore(): Promise<AppStore> {
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgres://dev_platform:dev_platform@localhost:5432/dev_platform";

  if (process.env.DISABLE_DATABASE === "true") {
    return new MemoryStore();
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query("select 1");
    await migrate(pool);
    return new PostgresStore(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    console.warn("PostgreSQL unavailable, falling back to in-memory store.", error);
    return new MemoryStore();
  }
}

class MemoryStore implements AppStore {
  kind: "memory" = "memory";
  private projects = new Map<string, ProjectSummary>();
  private workflows = new Map<string, WorkflowSummary>();
  private analyses = new Map<string, RequirementAnalysisRecord>();

  async listProjects() {
    return [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(projectId: string) {
    return this.projects.get(projectId) ?? null;
  }

  async createProject(input: { name: string; description: string }) {
    const timestamp = now();
    const project: ProjectSummary = {
      id: id("prj"),
      name: input.name,
      description: input.description,
      status: "created",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const workflow: WorkflowSummary = {
      id: id("wf"),
      projectId: project.id,
      currentStage: "PROJECT_IMPORTED",
      status: "waiting",
      updatedAt: timestamp
    };

    this.projects.set(project.id, project);
    this.workflows.set(workflow.id, workflow);
    return { project, workflow };
  }

  async listWorkflowsByProject(projectId: string) {
    return [...this.workflows.values()].filter((workflow) => workflow.projectId === projectId);
  }

  async updateWorkflowStage(input: {
    workflowId: string;
    currentStage: WorkflowSummary["currentStage"];
    status: WorkflowSummary["status"];
  }) {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) {
      return;
    }
    workflow.currentStage = input.currentStage;
    workflow.status = input.status;
    workflow.updatedAt = now();
  }

  async saveRequirementAnalysis(input: {
    projectId: string;
    workflowId: string | null;
    requirementText: string;
    questions: RequirementQuestion[];
    reflection: unknown;
  }) {
    const record: RequirementAnalysisRecord = {
      id: id("ra"),
      projectId: input.projectId,
      workflowId: input.workflowId,
      requirementText: input.requirementText,
      questions: input.questions,
      reflection: input.reflection,
      createdAt: now()
    };
    this.analyses.set(record.id, record);
    return record;
  }
}

class PostgresStore implements AppStore {
  kind: "postgres" = "postgres";

  constructor(private readonly pool: pg.Pool) {}

  async listProjects() {
    const result = await this.pool.query("select * from projects order by updated_at desc");
    return result.rows.map(mapProject);
  }

  async getProject(projectId: string) {
    const result = await this.pool.query("select * from projects where id = $1", [projectId]);
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async createProject(input: { name: string; description: string }) {
    const projectId = id("prj");
    const workflowId = id("wf");
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const projectResult = await client.query(
        `insert into projects (id, name, description, status)
         values ($1, $2, $3, 'created')
         returning *`,
        [projectId, input.name, input.description]
      );
      const workflowResult = await client.query(
        `insert into workflow_runs (id, project_id, current_stage, status)
         values ($1, $2, 'PROJECT_IMPORTED', 'waiting')
         returning *`,
        [workflowId, projectId]
      );
      await client.query("commit");
      return {
        project: mapProject(projectResult.rows[0]),
        workflow: mapWorkflow(workflowResult.rows[0])
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listWorkflowsByProject(projectId: string) {
    const result = await this.pool.query("select * from workflow_runs where project_id = $1 order by updated_at desc", [
      projectId
    ]);
    return result.rows.map(mapWorkflow);
  }

  async updateWorkflowStage(input: {
    workflowId: string;
    currentStage: WorkflowSummary["currentStage"];
    status: WorkflowSummary["status"];
  }) {
    await this.pool.query(
      `update workflow_runs
       set current_stage = $2, status = $3, updated_at = now()
       where id = $1`,
      [input.workflowId, input.currentStage, input.status]
    );
  }

  async saveRequirementAnalysis(input: {
    projectId: string;
    workflowId: string | null;
    requirementText: string;
    questions: RequirementQuestion[];
    reflection: unknown;
  }) {
    const result = await this.pool.query(
      `insert into requirement_analyses
        (id, project_id, workflow_id, requirement_text, questions, reflection)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [id("ra"), input.projectId, input.workflowId, input.requirementText, JSON.stringify(input.questions), JSON.stringify(input.reflection)]
    );
    return mapRequirementAnalysis(result.rows[0]);
  }
}

async function migrate(pool: pg.Pool) {
  await pool.query(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      description text not null default '',
      status text not null default 'created',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists workflow_runs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      current_stage text not null,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists requirement_analyses (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      workflow_id text references workflow_runs(id) on delete set null,
      requirement_text text not null,
      questions jsonb not null,
      reflection jsonb not null,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_projects_updated_at on projects(updated_at desc);
    create index if not exists idx_workflow_runs_project on workflow_runs(project_id);
    create index if not exists idx_requirement_analyses_project on requirement_analyses(project_id);
  `);
}

function mapProject(row: Record<string, unknown>): ProjectSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    status: row.status as ProjectSummary["status"],
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString()
  };
}

function mapWorkflow(row: Record<string, unknown>): WorkflowSummary {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    currentStage: row.current_stage as WorkflowSummary["currentStage"],
    status: row.status as WorkflowSummary["status"],
    updatedAt: new Date(row.updated_at as string).toISOString()
  };
}

function mapRequirementAnalysis(row: Record<string, unknown>): RequirementAnalysisRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    workflowId: row.workflow_id ? String(row.workflow_id) : null,
    requirementText: String(row.requirement_text),
    questions: row.questions as RequirementQuestion[],
    reflection: row.reflection,
    createdAt: new Date(row.created_at as string).toISOString()
  };
}
