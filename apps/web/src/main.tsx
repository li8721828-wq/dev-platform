import React from "react";
import { createRoot } from "react-dom/client";
import { workflowStageLabels, type ProjectSummary } from "@dev-platform/shared";
import { FileTree } from "./components/FileTree";
import { AiConfig } from "./components/AiConfig";
import { ClarificationPanel } from "./components/ClarificationPanel";
import { ReflectionReportView } from "./components/ReflectionReport";
import { CodeEditor, detectLanguage } from "./components/CodeEditor";
import { CodingPanel } from "./components/CodingPanel";
import { TraceabilityMatrix } from "./components/TraceabilityMatrix";
import { TestingPanel } from "./components/TestingPanel";
import { CodeReviewPanel } from "./components/CodeReviewPanel";
import { DeployConfigPanel } from "./components/DeployConfigPanel";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { RequirementPanel } from "./components/RequirementPanel";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type ActiveTab =
  | "project" | "requirement" | "clarification" | "reflection"
  | "solution" | "design" | "code" | "coding" | "testing" | "review" | "deploy" | "settings";

function App() {
  const [projects, setProjects] = React.useState<ProjectSummary[]>([]);
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

  // 项目表单状态（合并创建+导入）
  const [formName, setFormName] = React.useState("");
  const [formDesc, setFormDesc] = React.useState("");
  const [formImportType, setFormImportType] = React.useState<"none" | "local" | "git">("none");
  const [formLocalPath, setFormLocalPath] = React.useState("");
  const [formGitUrl, setFormGitUrl] = React.useState("");
  const [formBranch, setFormBranch] = React.useState("");
  const [formImporting, setFormImporting] = React.useState(false);
  const [formMsg, setFormMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null);


  // 项目内联文件浏览器
  const [previewFile, setPreviewFile] = React.useState<{ path: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // AI 项目分析
  const [aiAnalyzing, setAiAnalyzing] = React.useState(false);
  const [aiDescription, setAiDescription] = React.useState<string | null>(null);

  React.useEffect(() => { void loadProjects(); }, []);
  React.useEffect(() => { if (selectedProjectId) void loadWorkflows(selectedProjectId); }, [selectedProjectId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  async function analyzeProject(projectId: string) {
    setAiAnalyzing(true); setAiDescription(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/analyze-project`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setAiDescription(data.description);
      } else {
        setAiDescription(`分析失败: ${data.message || "未知错误"}`);
      }
    } catch {
      setAiDescription("AI 分析请求失败，请确认已配置 AI 提供商。");
    } finally {
      setAiAnalyzing(false);
    }
  }

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
    setFormImporting(true); setFormMsg(null);
    try {
      const body: Record<string, string> = { name: formName, description: formDesc };
      if (formLocalPath) { body.localPath = formLocalPath; if (formBranch) body.gitBranch = formBranch; }
      if (formGitUrl) { body.gitUrl = formGitUrl; if (formBranch) body.gitBranch = formBranch; }

      const response = await fetch(`${apiBaseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        setFormMsg({ type: "error", text: data.issues?.[0]?.message || data.message || "创建失败" });
        return;
      }
      if (data.importWarning) {
        setFormMsg({ type: "error", text: `项目已创建，但导入失败: ${data.importWarning}` });
      } else if (formLocalPath) {
        setFormMsg({ type: "success", text: "项目创建并导入本地目录成功！" });
      } else if (formGitUrl) {
        setFormMsg({ type: "success", text: "项目创建并克隆 Git 仓库成功！" });
      } else {
        setFormMsg({ type: "success", text: "项目创建成功！" });
      }
      setFormName(""); setFormDesc(""); setFormLocalPath(""); setFormGitUrl(""); setFormBranch(""); setFormImportType("none");
      await loadProjects();
    } catch {
      setFormMsg({ type: "error", text: "网络错误，请重试" });
    } finally {
      setFormImporting(false);
    }
  }
  async function previewFileFromTree(filePath: string) {
    if (!selectedProject) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${selectedProject.id}/files?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error("file not found");
      const data = await res.json();
      setPreviewFile({ path: filePath, content: data.content });
    } catch {
      setPreviewFile({ path: filePath, content: "// 无法加载文件内容" });
    } finally {
      setPreviewLoading(false);
    }
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
                <div className="panel-heading"><h2>新建项目</h2><span>{projects.length} 个项目</span></div>
                <p style={{ color: "#667085", fontSize: 13, margin: "0 0 12px 0" }}>
                  创建项目来管理你的代码。可以同时关联本地目录或 Git 仓库，AI 将能读取和分析你的代码文件。
                </p>
                <form className="form-stack" onSubmit={createProject}>
                  <div className="form-row">
                    <label>项目名称 *
                      <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例如 order-service" required />
                    </label>
                    <label>项目说明
                      <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="说明项目用途（可选）" />
                    </label>
                    <label>导入方式
                      <select value={formImportType} onChange={(e) => { setFormImportType(e.target.value as "none" | "local" | "git"); setFormMsg(null); }}>
                        <option value="none">仅创建项目</option>
                        <option value="local">本地路径导入</option>
                        <option value="git">Git 克隆导入</option>
                      </select>
                    </label>
                  </div>
                  {formImportType === "local" && (
                    <div className="form-row">
                      <label>本地项目路径 *
                        <input
                          value={formLocalPath}
                          onChange={(e) => { setFormLocalPath(e.target.value); setFormMsg(null); }}
                          placeholder="例如 D:\projects\my-app"
                          required
                        />
                      </label>
                      <label>分支
                        <input
                          value={formBranch}
                          onChange={(e) => setFormBranch(e.target.value)}
                          placeholder="默认当前分支"
                        />
                      </label>
                    </div>
                  )}
                  {formImportType === "git" && (
                    <div className="form-row">
                      <label>Git 仓库地址 *
                        <input
                          value={formGitUrl}
                          onChange={(e) => { setFormGitUrl(e.target.value); setFormMsg(null); }}
                          placeholder="https://github.com/user/repo.git"
                          required
                        />
                      </label>
                      <label>分支
                        <input
                          value={formBranch}
                          onChange={(e) => setFormBranch(e.target.value)}
                          placeholder="默认 main"
                        />
                      </label>
                    </div>
                  )}
                  <button type="submit" disabled={formImporting || !formName}>
                    {formImporting ? "处理中..." : formImportType !== "none" ? "创建并导入" : "创建项目"}
                  </button>
                </form>
                {formMsg && (
                  <div className={`alert ${formMsg.type === "error" ? "" : "alert-success"}`} style={{ marginTop: 8, color: formMsg.type === "error" ? "#b42318" : "#167a5b" }}>
                    {formMsg.text}
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-heading"><h2>项目列表</h2></div>
                <div className="table">
                  {projects.length === 0 ? (
                    <div className="empty">还没有项目，请在上方创建一个。</div>
                  ) : (
                    projects.map((project) => (
                      <button className={`project-row ${selectedProject?.id === project.id ? "selected" : ""}`}
                        key={project.id} onClick={() => { setSelectedProjectId(project.id); setPreviewFile(null); setAiDescription(null); }}>
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

              {selectedProject && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>AI 项目介绍</h2>
                    <button className="btn-small" onClick={() => analyzeProject(selectedProject.id)} disabled={aiAnalyzing}>
                      {aiAnalyzing ? "分析中..." : aiDescription ? "重新分析" : "AI 分析项目"}
                    </button>
                  </div>
                  {aiAnalyzing ? (
                    <div className="ai-analyzing">
                      <span className="ai-spinner"></span>
                      AI 正在分析项目文件，请稍候...
                    </div>
                  ) : aiDescription ? (
                    <div className="ai-description">
                      <MarkdownRenderer content={aiDescription} />
                    </div>
                  ) : (
                    <div className="ai-empty">点击右侧按钮，让 AI 分析项目并生成介绍文档</div>
                  )}
                </section>
              )}

              {selectedProject && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>项目文件</h2>
                    {previewFile && (
                      <button className="btn-small" onClick={() => { openFileFromTree(previewFile.path); }}>
                        编辑此文件
                      </button>
                    )}
                  </div>
                  <div className="inline-file-browser">
                    <div className="inline-file-tree">
                      <FileTree projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} onFileSelect={previewFileFromTree} />
                    </div>
                    <div className="inline-file-preview">
                      {previewLoading ? (
                        <div className="inline-file-empty">加载中...</div>
                      ) : previewFile ? (
                        <>
                          <div className="inline-file-path">{previewFile.path}</div>
                          <pre className="inline-file-content">{previewFile.content}</pre>
                        </>
                      ) : (
                        <div className="inline-file-empty">点击左侧文件查看内容</div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* 需求 */}
          {activeTab === "requirement" && selectedProject && (
            <RequirementPanel projectId={selectedProject.id} apiBaseUrl={apiBaseUrl} />
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
