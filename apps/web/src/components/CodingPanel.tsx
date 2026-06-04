/**
 * 编码操作面板 - 触发 AI 编码、预览生成结果、确认应用
 */
import React from "react";
import type { CodingTask, GeneratedFile } from "@dev-platform/shared";
import { CodeEditor, detectLanguage } from "./CodeEditor";

interface DesignDoc {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
}

interface CodingPanelProps {
  projectId: string;
  apiBaseUrl: string;
}

export function CodingPanel({ projectId, apiBaseUrl }: CodingPanelProps) {
  const [tasks, setTasks] = React.useState<CodingTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [designDocs, setDesignDocs] = React.useState<DesignDoc[]>([]);
  const [selectedDesignDocId, setSelectedDesignDocId] = React.useState("");
  const [requirementText, setRequirementText] = React.useState("");
  const [selectedTask, setSelectedTask] = React.useState<CodingTask | null>(null);
  const [previewFile, setPreviewFile] = React.useState<GeneratedFile | null>(null);

  React.useEffect(() => { loadTasks(); loadDesignDocs(); }, [projectId]);

  async function loadTasks() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/coding-tasks`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch { /* ignore */ }
  }

  async function loadDesignDocs() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/designs`);
      const data = await res.json();
      const docs = (data.documents ?? []).filter((d: DesignDoc) => d.type === "detail_design");
      setDesignDocs(docs);
      // 自动选择最新的设计文档
      if (docs.length > 0 && !selectedDesignDocId) {
        setSelectedDesignDocId(docs[0].id);
      }
    } catch { /* ignore */ }
  }

  async function generateCode() {
    if (!selectedDesignDocId) { setError("请先完成详细设计，或在下方选择设计文档"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/generate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designDocId: selectedDesignDocId, requirementText, clarifications: [] })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "生成失败"); }
      const task = await res.json();
      setSelectedTask(task);
      await loadTasks();
    } catch (e) { setError(e instanceof Error ? e.message : "生成失败"); }
    finally { setLoading(false); }
  }

  async function applyCode(taskId: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/apply-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codingTaskId: taskId })
      });
      if (!res.ok) throw new Error("应用失败");
      const result = await res.json();
      alert(`成功应用 ${result.applied?.length ?? 0} 个文件`);
      await loadTasks();
    } catch (e) { setError(e instanceof Error ? e.message : "应用失败"); }
    finally { setLoading(false); }
  }

  return (
    <div className="coding-panel">
      <h2>AI 编码</h2>
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panel-heading">
          <h3>生成代码</h3>
        </div>
        <div className="form-grid">
          <label>
            详细设计文档
            <select value={selectedDesignDocId} onChange={e => setSelectedDesignDocId(e.target.value)}>
              <option value="">请选择设计文档...</option>
              {designDocs.map(doc => (
                <option key={doc.id} value={doc.id}>{doc.title} ({doc.status})</option>
              ))}
            </select>
            {designDocs.length === 0 && <small style={{ color: "#999" }}>暂无设计文档，请先在“设计”Tab 生成详细设计</small>}
          </label>
          <label>
            需求描述
            <textarea value={requirementText} onChange={e => setRequirementText(e.target.value)} rows={3} placeholder="补充需求描述" />
          </label>
          <button className="primary" onClick={generateCode} disabled={loading}>
            {loading ? "生成中..." : "AI 生成代码"}
          </button>
        </div>
      </section>

      {selectedTask && (
        <section className="panel">
          <div className="panel-heading">
            <h3>生成结果预览 ({selectedTask.files?.length ?? 0} 个文件)</h3>
            <button className="primary" onClick={() => applyCode(selectedTask.id)} disabled={loading || selectedTask.status === "applied"}>
              {selectedTask.status === "applied" ? "已应用" : "应用代码到仓库"}
            </button>
          </div>
          <div className="file-list-split">
            <div className="file-list-sidebar">
              {selectedTask.files?.map((file, i) => (
                <button key={i} className={`file-item ${previewFile?.path === file.path ? "active" : ""}`}
                  onClick={() => setPreviewFile(file)}>
                  {file.path}
                </button>
              ))}
            </div>
            <div className="file-content">
              {previewFile ? (
                <CodeEditor
                  value={previewFile.content}
                  language={detectLanguage(previewFile.path)}
                  readOnly
                  height="400px"
                />
              ) : (
                <div className="empty">选择文件查看内容</div>
              )}
            </div>
          </div>
        </section>
      )}

      {tasks.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h3>编码历史</h3></div>
          <div className="table">
            {tasks.map(task => (
              <div key={task.id} className="row-item">
                <span><strong>{task.agentRole}</strong> - {task.files?.length ?? 0} 个文件</span>
                <em className={`status-badge status-${task.status}`}>{task.status}</em>
                <small>{new Date(task.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
