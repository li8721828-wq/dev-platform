import React from "react";
import { createRoot } from "react-dom/client";
import { workflowStageLabels, type ProjectSummary } from "@dev-platform/shared";
import { FileTree } from "./components/FileTree";
import { GitImport } from "./components/GitImport";
import { AiConfig } from "./components/AiConfig";
import { ClarificationPanel } from "./components/ClarificationPanel";
import { ReflectionReportView } from "./components/ReflectionReport";
import { CodeEditor, detectLanguage } from "./components/CodeEditor";
import { CodingPanel } from "./components/CodingPanel";
import { TraceabilityMatrix } from "./components/TraceabilityMatrix";
import { TestingPanel } from "./components/TestingPanel";
import { CodeReviewPanel } from "./components/CodeReviewPanel";
import { DeployConfigPanel } from "./components/DeployConfigPanel";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type ActiveTab =
  | "project" | "git" | "requirement" | "clarification" | "reflection"
  | "solution" | "design" | "code" | "coding" | "testing" | "review" | "deploy" | "settings";

function App() {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [requirementText, setRequirementText] = React.useState("");
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [questions, setQuestions] = React.useState<Array<{ id: string; question: string; priority: string; whyNeeded: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("project");
  const [currentWorkflowId, setCurrentWorkflowId] = React.useState<string | null>(null);
  const [currentWorkflowStage, setCurrentWorkflowStage] = React.useState<string>("PROJECT_IMPORTED");
  const [currentWorkflowStatus, setCurrentWorkflowStatus] = React.useState<string>("waiting");

  // 代码编辑器状态
  const [openFile, setOpenFile] = React.useState<{ path: string; content: string } | null>(null);
  const [editContent, setEditContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { void loadProjects(); }, []);
  React.useEffect(() => { if (selectedProjectId) void loadWorkflows(selectedProjectId); }, [selectedProjectId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  async function loadProjects() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`);
      const data = await response.json();
      setProjects(data.projects);
      setSelectedProjectId((current) => current ?? data.projects[0]?.id ?? null);
    } catch { setError("无法连接后端 API，请确认 apps/api 已启动。"); }
  }

  async function loadWorkflows(projectId: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/workflows`);
      const data = await response.json();
      if (data.workflows.length > 0) {
        const wf = data.workflows[0];
        setCurrentWorkflowId(wf.id);
        setCurrentWorkflowStage(wf.currentStage);
        setCurrentWorkflowStatus(wf.status);
      }
    } catch { /* ignore */ }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description })
      });
      if (!response.ok) throw new Error("create failed");
      setName(""); setDescription("");
      await loadProjects();
    } catch { setError("创建项目失败，请检查后端服务。"); }
    finally { setLoading(false); }
  }

  async function analyzeRequirement() {
    if (!selectedProject) { setError("请先创建项目。"); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${selectedProject.id}/analyze-requirement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementText })
      });
      if (!response.ok) { const data = await response.json(); throw new Error(data.message || "analysis failed"); }
      const data = await response.json();
      setQuestions(data.questions);
      await loadProjects();
      if (selectedProject) await loadWorkflows(selectedProject.id);
      setActiveTab("clarification");
    } catch (err) { setError(err instanceof Error ? err.message : "需求分析失败，请稍后重试。"); }
    finally { setLoading(false); }
  }

  async function openFileFromTree(filePath: string) {
    if (!selectedProject) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${selectedProject.id}/files?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error("file not found");
      const data = await res.json();
      setOpenFile({ path: filePath, content: data.content });
      setEditContent(data.content);
      setActiveTab("code");
    } catch { setError(`无法打开文件: ${filePath}`); }
  }

  async function saveFile() {
    if (!selectedProject || !openFile) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${selectedProject.id}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: openFile.path, content: editContent })
      });
      if (!res.ok) throw new Error("save failed");
      setOpenFile({ ...openFile, content: editContent });
      alert("保存成功");
    } catch { setError("保存失败"); }
    finally { setSaving(false); }
  }

  const tabs: { id: ActiveTab; label: string; icon: string }[] = [
    { id: "project", label: "项目", icon: "📁" },
    { id: "git", label: "Git", icon: "🔀" },
    { id: "requirement", label: "需求", icon: "📝" },
    { id: "clarification", label: "澄清", icon: "💬" },
    { id: "reflection", label: "反思", icon: "🔍" },
    { id: "solution", label: "方案", icon: "🏗️" },
    { id: "design", label: "设计", icon: "📐" },
    { id: "code", label: "代码", icon: "💻" },
    { id: "coding", label: "编码", icon: "⚡" },
    { id: "testing", label: "测试", icon: "🧪" },
    { id: "review", label: "审查", icon: "✅" },
    { id: "deploy", label: "部署", icon: "🚀" },
    { id: "settings", label: "设置", icon: "⚙️" }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">AI Dev Platform</div>
        <nav className="nav-list" aria-label="主导航">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </a>
          ))}
        </nav>

        {selectedProject && activeTab === "code" && (
          <div className="sidebar-file-tree">
            <FileTree projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} onFileSelect={openFileFromTree} />
          </div>
        )}
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>项目工作台</h1>
            <p>{selectedProject ? `当前项目：${selectedProject.name}` : "创建项目开始"}</p>
          </div>
          <div className="stage-badge">
            {workflowStageLabels[currentWorkflowStage as keyof typeof workflowStageLabels] ?? currentWorkflowStage}
            <small className="workflow-status">{currentWorkflowStatus}</small>
          </div>
        </header>

        {error ? <div className="alert">{error}</div> : null}

        <section className="tab-content">
          {/* 项目 */}
          {activeTab === "project" && (
            <div className="tab-panel">
              <section className="panel">
                <div className="panel-heading"><h2>创建项目</h2><span>{projects.length} 个项目</span></div>
                <form className="form-grid" onSubmit={createProject}>
                  <label>项目名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 order-service" required /></label>
                  <label>项目说明<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="说明项目用途" /></label>
                  <button type="submit" disabled={loading}>{loading ? "处理中" : "创建项目"}</button>
                </form>
              </section>
              <section className="panel">
                <div className="panel-heading"><h2>项目列表</h2></div>
                <div className="table">
                  {projects.length === 0 ? (
                    <div className="empty">还没有项目。</div>
                  ) : (
                    projects.map((project) => (
                      <button className={`project-row ${selectedProject?.id === project.id ? "selected" : ""}`}
                        key={project.id} onClick={() => setSelectedProjectId(project.id)}>
                        <span><strong>{project.name}</strong><small>{project.description || "暂无说明"}</small></span>
                        <em>{project.status}</em>
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Git */}
          {activeTab === "git" && selectedProject && (
            <div className="tab-panel">
              <section className="panel">
                <div className="panel-heading"><h2>Git 仓库导入</h2></div>
                <GitImport projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} onImportSuccess={() => {}} />
              </section>
            </div>
          )}

          {/* 需求 */}
          {activeTab === "requirement" && (
            <div className="tab-panel">
              <section className="panel">
                <div className="panel-heading"><h2>需求分析</h2></div>
                <label className="stacked">
                  需求内容
                  <textarea value={requirementText} onChange={(e) => setRequirementText(e.target.value)} rows={8} placeholder="输入需求描述..." />
                </label>
                <button className="primary" onClick={analyzeRequirement} disabled={loading || !selectedProject}>
                  {loading ? "分析中..." : "AI 分析需求"}
                </button>
              </section>
            </div>
          )}

          {/* 澄清 */}
          {activeTab === "clarification" && selectedProject && (
            <div className="tab-panel">
              <ClarificationPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 反思 */}
          {activeTab === "reflection" && currentWorkflowId && (
            <div className="tab-panel">
              <ReflectionReportView workflowId={currentWorkflowId} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 方案 */}
          {activeTab === "solution" && selectedProject && (
            <div className="tab-panel">
              <SolutionPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 设计 */}
          {activeTab === "design" && selectedProject && (
            <div className="tab-panel">
              <DesignPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 代码编辑器 */}
          {activeTab === "code" && selectedProject && (
            <div className="tab-panel">
              <section className="panel">
                <div className="panel-heading">
                  <h2>{openFile?.path ?? "代码编辑器"}</h2>
                  {openFile && (
                    <button className="primary" onClick={saveFile} disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </button>
                  )}
                </div>
                {openFile ? (
                  <CodeEditor
                    value={editContent}
                    language={detectLanguage(openFile.path)}
                    onChange={setEditContent}
                    height="600px"
                  />
                ) : (
                  <div className="empty">从左侧文件树选择文件进行编辑</div>
                )}
              </section>
            </div>
          )}

          {/* 编码 */}
          {activeTab === "coding" && selectedProject && (
            <div className="tab-panel">
              <CodingPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
              <TraceabilityMatrix projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 测试 */}
          {activeTab === "testing" && selectedProject && (
            <div className="tab-panel">
              <TestingPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 审查 */}
          {activeTab === "review" && selectedProject && (
            <div className="tab-panel">
              <CodeReviewPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 部署 */}
          {activeTab === "deploy" && selectedProject && (
            <div className="tab-panel">
              <DeployConfigPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
            </div>
          )}

          {/* 设置 */}
          {activeTab === "settings" && (
            <div className="tab-panel">
              <AiConfig apiBaseUrl={apiBaseUrl} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ========== 方案设计面板 ==========
function SolutionPanel({ projectId, apiBaseUrl }: { projectId: string; apiBaseUrl: string }) {
  const [docs, setDocs] = React.useState<Array<{ id: string; title: string; status: string; createdAt: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requirementText, setRequirementText] = React.useState("");
  const [selectedDoc, setSelectedDoc] = React.useState<unknown>(null);

  React.useEffect(() => { loadDocs(); }, [projectId]);

  async function loadDocs() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/designs`);
      const data = await res.json();
      setDocs((data.documents ?? []).filter((d: { type: string }) => d.type === "solution"));
    } catch { /* ignore */ }
  }

  async function generateSolution() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/generate-solution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementText, clarifications: [], existingFiles: [] })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "生成失败"); }
      const doc = await res.json();
      setSelectedDoc(doc.content);
      await loadDocs();
    } catch (e) { setError(e instanceof Error ? e.message : "生成失败"); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h2>方案设计</h2>
      {error && <div className="alert">{error}</div>}
      <section className="panel">
        <div className="panel-heading"><h3>生成方案设计</h3></div>
        <label className="stacked">
          需求描述
          <textarea value={requirementText} onChange={e => setRequirementText(e.target.value)} rows={5} placeholder="描述项目需求..." />
        </label>
        <button className="primary" onClick={generateSolution} disabled={loading}>
          {loading ? "生成中..." : "AI 生成方案"}
        </button>
      </section>
      {Boolean(selectedDoc) && (
        <section className="panel">
          <div className="panel-heading"><h3>方案预览</h3></div>
          <pre style={{ maxHeight: 400, overflow: "auto", fontSize: 12, padding: 16, background: "#f5f5f5", borderRadius: 4 }}>
            {JSON.stringify(selectedDoc, null, 2)}
          </pre>
        </section>
      )}
      {docs.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h3>历史方案</h3></div>
          {docs.map(doc => (
            <div key={doc.id} className="row-item">
              <strong>{doc.title}</strong>
              <em>{doc.status}</em>
              <small>{new Date(doc.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ========== 详细设计面板 ==========
function DesignPanel({ projectId, apiBaseUrl }: { projectId: string; apiBaseUrl: string }) {
  const [docs, setDocs] = React.useState<Array<{ id: string; title: string; status: string; createdAt: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [solutionDocId, setSolutionDocId] = React.useState("");
  const [requirementText, setRequirementText] = React.useState("");
  const [selectedDoc, setSelectedDoc] = React.useState<unknown>(null);

  React.useEffect(() => { loadDocs(); }, [projectId]);

  async function loadDocs() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/designs`);
      const data = await res.json();
      setDocs((data.documents ?? []).filter((d: { type: string }) => d.type === "detail_design"));
    } catch { /* ignore */ }
  }

  async function generateDetailDesign() {
    if (!solutionDocId) { setError("请输入方案设计文档 ID"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/generate-detail-design`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solutionDocId, requirementText, clarifications: [] })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "生成失败"); }
      const doc = await res.json();
      setSelectedDoc(doc.content);
      await loadDocs();
    } catch (e) { setError(e instanceof Error ? e.message : "生成失败"); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h2>详细设计</h2>
      {error && <div className="alert">{error}</div>}
      <section className="panel">
        <div className="panel-heading"><h3>生成详细设计</h3></div>
        <div className="form-grid">
          <label>方案文档 ID<input value={solutionDocId} onChange={e => setSolutionDocId(e.target.value)} placeholder="从方案设计获取" /></label>
          <label>补充需求<textarea value={requirementText} onChange={e => setRequirementText(e.target.value)} rows={3} placeholder="可选补充" /></label>
          <button className="primary" onClick={generateDetailDesign} disabled={loading}>
            {loading ? "生成中..." : "AI 生成详细设计"}
          </button>
        </div>
      </section>
      {Boolean(selectedDoc) && (
        <section className="panel">
          <div className="panel-heading"><h3>详细设计预览</h3></div>
          <pre style={{ maxHeight: 400, overflow: "auto", fontSize: 12, padding: 16, background: "#f5f5f5", borderRadius: 4 }}>
            {JSON.stringify(selectedDoc, null, 2)}
          </pre>
        </section>
      )}
      {docs.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h3>历史详细设计</h3></div>
          {docs.map(doc => (
            <div key={doc.id} className="row-item">
              <strong>{doc.title}</strong>
              <em>{doc.status}</em>
              <small>{new Date(doc.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
