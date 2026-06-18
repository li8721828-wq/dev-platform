import React from "react";
import type { RequirementMaterial, RequirementQuestion, RequirementAnalysisResult } from "@dev-platform/shared";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  projectId: string;
  apiBaseUrl: string;
}

// 格式图标
function formatIcon(format: string): string {
  const f = format.toLowerCase();
  if ([".docx", ".doc"].includes(f)) return "📄";
  if ([".pdf"].includes(f)) return "📑";
  if ([".xlsx", ".xls", ".csv"].includes(f)) return "📊";
  if ([".xml"].includes(f)) return "📋";
  if ([".json"].includes(f)) return "📦";
  if ([".zip"].includes(f)) return "🗜️";
  if ([".md", ".txt", ".log"].includes(f)) return "📝";
  if ([".html", ".htm"].includes(f)) return "🌐";
  if ([".sql"].includes(f)) return "🗄️";
  if ([".yaml", ".yml"].includes(f)) return "⚙️";
  if (f === "error") return "❌";
  return "📎";
}

export function RequirementPanel({ projectId, apiBaseUrl }: Props) {
  const [materials, setMaterials] = React.useState<RequirementMaterial[]>([]);
  const [reqPath, setReqPath] = React.useState("");
  const [refPath, setRefPath] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<RequirementAnalysisResult | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [embedViewer, setEmbedViewer] = React.useState<{ materialId: string; index: number; fileName: string; format: string } | null>(null);

  // 加载已有数据
  React.useEffect(() => {
    loadMaterials();
    loadAnalysis();
  }, [projectId]);

  async function loadMaterials() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/requirement-materials`);
      const data = await res.json();
      setMaterials(data.materials || []);
    } catch { /* ignore */ }
  }

  async function loadAnalysis() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/requirement-analysis`);
      const data = await res.json();
      if (data.result) setAnalysis(data.result);
    } catch { /* ignore */ }
  }

  async function addMaterials(type: "requirement" | "reference", pathInput: string) {
    const paths = pathInput.split("\n").map(p => p.trim()).filter(Boolean);
    if (paths.length === 0) return;

    setAdding(true); setMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/requirement-materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, paths })
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.message || data.issues?.[0]?.message || "添加失败" });
        return;
      }
      setMsg({ type: "success", text: `成功添加 ${data.materials.length} 个文件` });
      if (type === "requirement") setReqPath("");
      else setRefPath("");
      loadMaterials();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "添加失败" });
    } finally {
      setAdding(false);
    }
  }

  async function deleteMaterial(materialId: string) {
    try {
      await fetch(`${apiBaseUrl}/api/projects/${projectId}/requirement-materials/${materialId}`, { method: "DELETE" });
      loadMaterials();
    } catch { /* ignore */ }
  }

  async function analyzeMaterials() {
    setAnalyzing(true); setMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/analyze-materials`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.message || "分析失败" });
        return;
      }
      setAnalysis(data);
      setMsg({ type: "success", text: "AI 分析完成" });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "分析失败" });
    } finally {
      setAnalyzing(false);
    }
  }

  const reqMaterials = materials.filter(m => m.type === "requirement");
  const refMaterials = materials.filter(m => m.type === "reference");
  const totalSuccess = materials.filter(m => m.status === "success").length;

  return (
    <div className="tab-panel">
      {/* 需求文档 */}
      <section className="panel">
        <div className="panel-heading">
          <h2>需求文档</h2>
          <span className="badge">{reqMaterials.length} 个文件</span>
        </div>
        <p className="form-hint">输入需求文档的本地路径（支持 Word、PDF、XML、TXT、MD 等格式），每行一个路径</p>
        <textarea
          value={reqPath}
          onChange={(e) => setReqPath(e.target.value)}
          rows={3}
          placeholder={"D:\\docs\\需求规格说明书.docx\nD:\\docs\\业务流程.xml"}
          className="path-input"
        />
        <button
          className="primary"
          onClick={() => addMaterials("requirement", reqPath)}
          disabled={adding || !reqPath.trim()}
          style={{ marginTop: 8 }}
        >
          {adding ? "读取中..." : "+ 添加需求文档"}
        </button>
        {reqMaterials.length > 0 && (
          <MaterialList
            projectId={projectId}
            apiBaseUrl={apiBaseUrl}
            materials={reqMaterials}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            onDelete={deleteMaterial}
            onEmbedClick={(materialId, index, fileName, format) => setEmbedViewer({ materialId, index, fileName, format })}
          />
        )}
      </section>

      {/* 参考资料 */}
      <section className="panel">
        <div className="panel-heading">
          <h2>参考资料</h2>
          <span className="badge">{refMaterials.length} 个文件</span>
        </div>
        <p className="form-hint">输入参考资料的本地路径（接口文档、报文样例、数据字典、配置文件等）</p>
        <textarea
          value={refPath}
          onChange={(e) => setRefPath(e.target.value)}
          rows={3}
          placeholder={"D:\\docs\\接口文档.xml\nD:\\docs\\报文样例.zip\nD:\\docs\\数据字典.xlsx"}
          className="path-input"
        />
        <button
          className="primary"
          onClick={() => addMaterials("reference", refPath)}
          disabled={adding || !refPath.trim()}
          style={{ marginTop: 8 }}
        >
          {adding ? "读取中..." : "+ 添加参考资料"}
        </button>
        {refMaterials.length > 0 && (
          <MaterialList
            projectId={projectId}
            apiBaseUrl={apiBaseUrl}
            materials={refMaterials}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            onDelete={deleteMaterial}
            onEmbedClick={(materialId, index, fileName, format) => setEmbedViewer({ materialId, index, fileName, format })}
          />
        )}
      </section>

      {/* AI 分析 */}
      <section className="panel">
        <div className="panel-heading"><h2>AI 需求分析</h2></div>
        <div className="ai-analysis-actions">
          <button
            className="primary"
            onClick={analyzeMaterials}
            disabled={analyzing || totalSuccess === 0}
          >
            {analyzing ? "⏳ AI 分析中..." : "🤖 AI 分析需求材料"}
          </button>
          {totalSuccess === 0 && (
            <span className="hint-text">请先添加需求文档或参考资料</span>
          )}
          {totalSuccess > 0 && (
            <span className="hint-text">将分析 {totalSuccess} 个文件的内容</span>
          )}
        </div>

        {msg && (
          <div className={`alert ${msg.type === "error" ? "" : "alert-success"}`} style={{ marginTop: 8 }}>
            {msg.text}
          </div>
        )}

        {analysis && (
          <div className="analysis-result" style={{ marginTop: 16 }}>
            <div className="panel-heading"><h3>需求理解报告</h3></div>
            <MarkdownRenderer content={analysis.aiSummary} />
            {analysis.questions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="panel-heading"><h3>澄清问题清单</h3></div>
                <QuestionList questions={analysis.questions} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* 嵌入文件查看器 */}
      {embedViewer && (
        <EmbedViewerModal
          projectId={projectId}
          apiBaseUrl={apiBaseUrl}
          materialId={embedViewer.materialId}
          index={embedViewer.index}
          fileName={embedViewer.fileName}
          format={embedViewer.format}
          onClose={() => setEmbedViewer(null)}
        />
      )}
    </div>
  );
}

// 材料列表组件
function MaterialList({ projectId, apiBaseUrl, materials, expandedId, onToggle, onDelete, onEmbedClick }: {
  projectId: string;
  apiBaseUrl: string;
  materials: RequirementMaterial[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEmbedClick: (materialId: string, index: number, fileName: string, format: string) => void;
}) {
  const [fullContent, setFullContent] = React.useState<Record<string, { content: string; contentType: string }>>({});
  const [loadingContent, setLoadingContent] = React.useState<string | null>(null);

  // 展开时自动加载内容
  React.useEffect(() => {
    if (expandedId && !fullContent[expandedId] && !loadingContent) {
      const m = materials.find(mat => mat.id === expandedId);
      if (m && m.status === "success") {
        loadFullContent(expandedId);
      }
    }
  }, [expandedId]);

  async function loadFullContent(materialId: string) {
    if (fullContent[materialId]) return;
    setLoadingContent(materialId);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/requirement-materials/${materialId}/content`);
      const data = await res.json();
      if (res.ok) {
        setFullContent(prev => ({ ...prev, [materialId]: { content: data.content, contentType: data.contentType || "text" } }));
      }
    } catch { /* ignore */ }
    setLoadingContent(null);
  }

  function renderDocViewer(materialId: string, format: string) {
    const rawUrl = `${apiBaseUrl}/api/projects/${projectId}/requirement-materials/${materialId}/raw`;

    // PDF: 浏览器内置查看器
    if (format === ".pdf") {
      return (
        <div className="doc-viewer">
          <iframe src={rawUrl} className="pdf-viewer" title="PDF预览" />
        </div>
      );
    }

    // 图片
    if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".webp"].includes(format)) {
      return (
        <div className="doc-viewer">
          <img src={rawUrl} alt={format} className="doc-image" />
        </div>
      );
    }

    return null;
  }

  function renderLoadedContent(materialId: string, format: string) {
    const loaded = fullContent[materialId];
    if (!loaded) return null;

    // Word/Excel: HTML 富文本渲染
    if (loaded.contentType === "html" || loaded.contentType === "table") {
      return (
        <div className="doc-viewer">
          <div
            className={`doc-html-content ${loaded.contentType === "table" ? "doc-table-content" : ""}`}
            dangerouslySetInnerHTML={{ __html: loaded.content }}
          />
        </div>
      );
    }

    // PDF: 已用 iframe 显示，这里返回 null
    if (loaded.contentType === "pdf") return null;

    // 默认: 文本
    return <pre className="material-preview material-full">{loaded.content}</pre>;
  }

  // 判断是否可以直接用 raw URL 显示
  function isRawViewable(format: string): boolean {
    return [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".webp"].includes(format);
  }

  return (
    <div className="material-list" style={{ marginTop: 12 }}>
      {materials.map(m => (
        <div key={m.id} className={`material-item ${m.status === "error" ? "material-error" : ""}`}>
          <div className="material-header" onClick={() => onToggle(m.id)}>
            <span className="material-icon">{formatIcon(m.format)}</span>
            <span className="material-name">{m.fileName}</span>
            <span className="material-format">{m.format}</span>
            <span className={`material-status status-${m.status}`}>
              {m.status === "success" ? "✓" : m.status === "error" ? "✗" : "..."}
            </span>
            <button
              className="material-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
              title="移除"
            >
              ×
            </button>
          </div>
          {expandedId === m.id && (
            <div className="material-detail">
              <div className="material-path">{m.filePath}</div>
              {m.error && <div className="material-error-msg">{m.error}</div>}
              {loadingContent === m.id && (
                <div className="material-loading">⏳ 正在读取文档内容...</div>
              )}
              {/* PDF/图片: 直接用 iframe/img 显示 */}
              {m.status === "success" && isRawViewable(m.format) && renderDocViewer(m.id, m.format)}
              {/* Word/Excel/文本: 加载后渲染 */}
              {m.status === "success" && !isRawViewable(m.format) && (
                <div onClick={(e) => {
                  const target = (e.target as HTMLElement).closest(".embedded-file") as HTMLElement;
                  if (target) {
                    const idx = parseInt(target.getAttribute("data-embed-index") || "0", 10);
                    const fmt = target.getAttribute("data-format") || "";
                    const name = target.getAttribute("data-filename") || "嵌入文件";
                    onEmbedClick(m.id, idx, name, fmt);
                  }
                }}>
                  {renderLoadedContent(m.id, m.format)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 嵌入文件查看器模态框
function EmbedViewerModal({ projectId, apiBaseUrl, materialId, index, fileName, format, onClose }: {
  projectId: string;
  apiBaseUrl: string;
  materialId: string;
  index: number;
  fileName: string;
  format: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [previewData, setPreviewData] = React.useState<{ type: string; html?: string; content?: string; url?: string } | null>(null);
  const embedUrl = `${apiBaseUrl}/api/projects/${projectId}/requirement-materials/${materialId}/embedded/${index}`;
  const previewUrl = `${embedUrl}/preview`;

  React.useEffect(() => {
    setLoading(true);
    fetch(previewUrl)
      .then(r => r.json())
      .then(data => {
        setPreviewData(data);
        setLoading(false);
      })
      .catch(() => {
        setPreviewData({ type: "error" });
        setLoading(false);
      });
  }, [previewUrl]);

  return (
    <div className="embed-modal-overlay" onClick={onClose}>
      <div className="embed-modal-content" onClick={e => e.stopPropagation()}>
        <div className="embed-modal-header">
          <span className="embed-modal-title">{formatIcon(format)} {fileName}</span>
          <div className="embed-modal-actions">
            <a href={embedUrl} download className="embed-modal-download" title="下载">⬇️ 下载</a>
            <button className="embed-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="embed-modal-body">
          {loading && <div className="material-loading">⏳ 正在加载文件内容...</div>}
          {!loading && previewData?.type === "table" && previewData.html && (
            <div className="doc-viewer">
              <div className="doc-html-content doc-table-content"
                dangerouslySetInnerHTML={{ __html: previewData.html }} />
            </div>
          )}
          {!loading && previewData?.type === "text" && previewData.content && (
            <pre className="embed-text-content">{previewData.content}</pre>
          )}
          {!loading && previewData?.type === "pdf" && previewData.url && (
            <iframe src={`${apiBaseUrl}${previewData.url}`} className="embed-pdf-viewer" title={fileName} />
          )}
          {!loading && previewData?.type === "image" && previewData.url && (
            <img src={`${apiBaseUrl}${previewData.url}`} alt={fileName} className="embed-image" />
          )}
          {!loading && previewData?.type === "error" && (
            <div className="embed-unsupported">
              <p>文件加载失败</p>
              <a href={embedUrl} download className="embed-download-link">⬇️ 点击下载 {fileName}</a>
            </div>
          )}
          {!loading && previewData && !["table", "text", "pdf", "image", "error"].includes(previewData.type) && (
            <div className="embed-unsupported">
              <p>格式 {format} 暂不支持在线预览</p>
              <a href={embedUrl} download className="embed-download-link">⬇️ 点击下载 {fileName}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 问题清单组件
function QuestionList({ questions }: { questions: RequirementQuestion[] }) {
  const priorityColor: Record<string, string> = {
    blocking: "#dc2626", high: "#d97706", medium: "#0891b2", low: "#64748b"
  };
  const priorityLabel: Record<string, string> = {
    blocking: "阻断", high: "高", medium: "中", low: "低"
  };
  const categoryLabel: Record<string, string> = {
    business_rule: "业务规则", field_definition: "字段定义", permission: "权限",
    exception: "异常处理", acceptance: "验收标准", non_functional: "非功能需求"
  };

  return (
    <div className="question-list">
      {questions.map(q => (
        <div key={q.id} className="question-item">
          <div className="question-header">
            <span className="question-id">{q.id}</span>
            <span className="question-priority" style={{ color: priorityColor[q.priority], fontWeight: 600 }}>
              {priorityLabel[q.priority]}
            </span>
            <span className="question-category">{categoryLabel[q.category] || q.category}</span>
          </div>
          <div className="question-text">{q.question}</div>
          <div className="question-why">💡 {q.whyNeeded}</div>
          {q.candidateAnswers.length > 0 && (
            <div className="question-answers">
              <strong>候选答案：</strong>
              <ul>{q.candidateAnswers.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
