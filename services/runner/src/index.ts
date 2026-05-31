import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const port = Number(process.env.RUNNER_PORT ?? 3011);
const app = express();

app.use(express.json({ limit: "1mb" }));

const runSchema = z.object({
  projectId: z.string().min(1),
  command: z.string().min(1),
  timeoutSeconds: z.number().int().positive().max(3600).default(1800)
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dev-platform-runner",
    time: new Date().toISOString()
  });
});

app.post("/runner/jobs", (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
    return;
  }

  res.status(202).json({
    jobId: `job_${randomUUID()}`,
    status: "queued",
    message: "MVP runner scaffold received the job. Docker execution will be implemented next.",
    job: parsed.data
  });
});

app.listen(port, () => {
  console.log(`Runner listening on http://localhost:${port}`);
});
