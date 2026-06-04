import express from "express";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const port = Number(process.env.RUNNER_PORT ?? 3011);
const app = express();

app.use(express.json({ limit: "1mb" }));

const runSchema = z.object({
  projectId: z.string().min(1),
  command: z.string().min(1),
  timeoutSeconds: z.number().int().positive().max(3600).default(1800)
});

interface JobRecord {
  jobId: string;
  projectId: string;
  command: string;
  status: "queued" | "running" | "completed" | "failed";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

const jobs = new Map<string, JobRecord>();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dev-platform-runner",
    activeJobs: jobs.size,
    time: new Date().toISOString()
  });
});

app.post("/runner/jobs", (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
    return;
  }

  const jobId = `job_${randomUUID()}`;
  const job: JobRecord = {
    jobId,
    projectId: parsed.data.projectId,
    command: parsed.data.command,
    status: "queued",
    stdout: "",
    stderr: "",
    exitCode: null,
    createdAt: new Date().toISOString()
  };
  jobs.set(jobId, job);

  // 异步执行命令
  const cwd = process.env.WORKSPACE_ROOT
    ? `${process.env.WORKSPACE_ROOT}/${parsed.data.projectId}/repo`
    : undefined;

  const [cmd, ...args] = parsed.data.command.split(" ");

  execFileAsync(cmd, args, {
    timeout: parsed.data.timeoutSeconds * 1000,
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    shell: true
  })
    .then(({ stdout, stderr }) => {
      job.status = "completed";
      job.stdout = stdout;
      job.stderr = stderr;
      job.exitCode = 0;
      job.completedAt = new Date().toISOString();
    })
    .catch((error: { stdout?: string; stderr?: string; code?: number; killed?: boolean }) => {
      job.status = "failed";
      job.stdout = error.stdout ?? "";
      job.stderr = error.stderr ?? String(error);
      job.exitCode = error.code ?? 1;
      job.completedAt = new Date().toISOString();
    });

  job.status = "running";
  job.startedAt = new Date().toISOString();

  res.status(202).json({
    jobId: job.jobId,
    status: job.status,
    message: "Job started"
  });
});

app.get("/runner/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "job_not_found" });
    return;
  }
  res.json(job);
});

app.get("/runner/jobs", (_req, res) => {
  const allJobs = [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ jobs: allJobs });
});

app.listen(port, () => {
  console.log(`Runner listening on http://localhost:${port}`);
});
