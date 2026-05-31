import React from "react";
import { createRoot } from "react-dom/client";
import { workflowStageLabels, type ProjectSummary } from "@dev-platform/shared";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

function App() {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [requirementText, setRequirementText] = React.useState("用户上传需求后，平台需要结合代码生成不明确问题，并支持业务反馈。");
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [questions, setQuestions] = React.useState<Array<{ id: string; question: string; priority: string; whyNeeded: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadProjects();
  }, []);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  async function loadProjects() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`);
      const data = await response.json();
      setProjects(data.projects);
      setSelectedProjectId((current) => current ?? data.projects[0]?.id ?? null);
    } catch {
      setError("无法连接后端 API，请确认 apps/api 已启动。");
    }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description })
      });
      if (!response.ok) {
        throw new Error("create failed");
      }
      setName("");
      setDescription("");
      await loadProjects();
    } catch {
      setError("创建项目失败，请检查后端服务。");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeRequirement() {
    if (!selectedProject) {
      setError("请先创建项目。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${selectedProject.id}/analyze-requirement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementText })
      });
      if (!response.ok) {
        throw new Error("analysis failed");
      }
      const data = await response.json();
      setQuestions(data.questions);
      await loadProjects();
    } catch {
      setError("需求分析失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AI Dev Platform</div>
        <nav className="nav-list" aria-label="主导航">
          <a className="active">项目</a>
          <a>需求</a>
          <a>澄清</a>
          <a>方案</a>
          <a>详细设计</a>
          <a>编码</a>
          <a>自测</a>
          <a>CR</a>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>项目工作台</h1>
            <p>先跑通项目创建和需求澄清问题生成，后续接入代码上传、编辑器和 Agent 编排。</p>
          </div>
          <div className="stage-badge">{workflowStageLabels.PROJECT_IMPORTED}</div>
        </header>

        {error ? <div className="alert">{error}</div> : null}

        <section className="layout">
          <div className="main-panel">
            <section className="panel">
              <div className="panel-heading">
                <h2>创建项目</h2>
                <span>{projects.length} 个项目</span>
              </div>
              <form className="form-grid" onSubmit={createProject}>
                <label>
                  项目名称
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 order-service" required />
                </label>
                <label>
                  项目说明
                  <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明项目用途" />
                </label>
                <button type="submit" disabled={loading}>
                  {loading ? "处理中" : "创建项目"}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>项目列表</h2>
                <span>选择一个项目进入需求分析</span>
              </div>
              <div className="table">
                {projects.length === 0 ? (
                  <div className="empty">还没有项目。创建第一个项目后，可以上传需求并生成澄清问题。</div>
                ) : (
                  projects.map((project) => (
                    <button
                      className={`project-row ${selectedProject?.id === project.id ? "selected" : ""}`}
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <span>
                        <strong>{project.name}</strong>
                        <small>{project.description || "暂无说明"}</small>
                      </span>
                      <em>{project.status}</em>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>需求分析</h2>
                <span>{selectedProject ? selectedProject.name : "请先创建项目"}</span>
              </div>
              <label className="stacked">
                需求内容
                <textarea value={requirementText} onChange={(event) => setRequirementText(event.target.value)} rows={6} />
              </label>
              <button className="primary" onClick={analyzeRequirement} disabled={loading || !selectedProject}>
                {loading ? "分析中" : "分析需求"}
              </button>
            </section>
          </div>

          <aside className="side-panel">
            <h2>AI 澄清问题</h2>
            {questions.length === 0 ? (
              <p className="muted">提交需求后，这里会展示 AI 生成的不明确问题。</p>
            ) : (
              <div className="question-list">
                {questions.map((question) => (
                  <article className="question" key={question.id}>
                    <div className="question-meta">
                      <span>{question.id}</span>
                      <strong>{question.priority}</strong>
                    </div>
                    <h3>{question.question}</h3>
                    <p>{question.whyNeeded}</p>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
