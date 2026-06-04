/**
 * 需求追溯矩阵展示组件
 */
import React from "react";
import type { TraceabilityEntry } from "@dev-platform/shared";

interface TraceabilityMatrixProps {
  projectId: string;
  apiBaseUrl: string;
}

export function TraceabilityMatrix({ projectId, apiBaseUrl }: TraceabilityMatrixProps) {
  const [entries, setEntries] = React.useState<TraceabilityEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => { loadTraceability(); }, [projectId]);

  async function loadTraceability() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/traceability`);
      const data = await res.json();
      setEntries(data.traceability ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (loading) return <div className="loading">加载追溯矩阵中...</div>;
  if (entries.length === 0) return <div className="empty">暂无追溯数据。请先完成 AI 编码流程。</div>;

  const covered = entries.filter(e => e.coverage === "covered").length;
  const partial = entries.filter(e => e.coverage === "partial").length;
  const missing = entries.filter(e => e.coverage === "missing").length;

  return (
    <div className="traceability-matrix">
      <h2>需求追溯矩阵</h2>
      <div className="traceability-summary">
        <span className="badge badge-success">已覆盖: {covered}</span>
        <span className="badge badge-warning">部分覆盖: {partial}</span>
        <span className="badge badge-danger">未覆盖: {missing}</span>
      </div>

      <table className="trace-table">
        <thead>
          <tr>
            <th>需求 ID</th>
            <th>需求描述</th>
            <th>设计章节</th>
            <th>代码文件</th>
            <th>覆盖率</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={i}>
              <td><strong>{entry.requirementId}</strong></td>
              <td>{entry.requirementText}</td>
              <td>{entry.designSection ?? "-"}</td>
              <td>
                {entry.codeFiles.map((f, j) => (
                  <span key={j} className="code-file-tag">{f}</span>
                ))}
              </td>
              <td>
                <span className={`coverage-badge coverage-${entry.coverage}`}>
                  {entry.coverage === "covered" ? "完全覆盖" : entry.coverage === "partial" ? "部分覆盖" : "未覆盖"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
