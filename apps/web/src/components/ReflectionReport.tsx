import React from "react";

interface ReflectionIssue {
  type: string;
  severity: string;
  description: string;
  suggestion: string;
}

interface ReflectionReport {
  id: string;
  stage: string;
  score: number;
  canContinue: boolean;
  blockingIssues: ReflectionIssue[];
  nonBlockingIssues: ReflectionIssue[];
  consistencyCheck: {
    requirement_vs_analysis?: string;
    analysis_vs_questions?: string;
    questions_vs_answers?: string;
  };
  evidence: string[];
  nextAction: string;
  summary: string;
  createdAt: string;
}

interface ReflectionReportProps {
  workflowId: string;
  apiBaseUrl: string;
}

export function ReflectionReportView({ workflowId, apiBaseUrl }: ReflectionReportProps) {
  const [report, setReport] = React.useState<ReflectionReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function getScoreColor(score: number): string {
    if (score >= 90) return "#167a5b";
    if (score >= 75) return "#2457d6";
    if (score >= 60) return "#a35f00";
    return "#b42318";
  }

  function getScoreLabel(score: number): string {
    if (score >= 90) return "优秀";
    if (score >= 75) return "良好";
    if (score >= 60) return "及格";
    return "不合格";
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/workflows/${workflowId}/reflect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "REQUIREMENT_ANALYSIS" })
      });

      if (response.ok) {
        const data = await response.json();
        setReport(data);
      } else {
        const data = await response.json();
        setError(data.message || "生成反思报告失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setGenerating(false);
    }
  }

  if (!report && !loading) {
    return (
      <div className="reflection-panel">
        <div className="panel-heading">
          <h3>反思报告</h3>
        </div>
        <div className="reflection-empty">
          <p>暂无反思报告</p>
          <button onClick={handleGenerate} disabled={generating} className="primary">
            {generating ? "生成中..." : "生成反思报告"}
          </button>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="reflection-panel">
      <div className="panel-heading">
        <h3>反思报告</h3>
        <button onClick={handleGenerate} disabled={generating} className="btn-small">
          {generating ? "重新生成中..." : "重新生成"}
        </button>
      </div>

      <div className="reflection-content">
        {/* 评分卡片 */}
        <div className="score-card">
          <div className="score-circle" style={{ borderColor: getScoreColor(report.score) }}>
            <span className="score-value" style={{ color: getScoreColor(report.score) }}>{report.score}</span>
            <span className="score-label">{getScoreLabel(report.score)}</span>
          </div>
          <div className="score-info">
            <div className={`continue-badge ${report.canContinue ? "can-continue" : "cannot-continue"}`}>
              {report.canContinue ? "可进入下一阶段" : "需要处理阻断问题"}
            </div>
            <p className="summary">{report.summary}</p>
          </div>
        </div>

        {/* 一致性检查 */}
        <div className="consistency-section">
          <h4>一致性检查</h4>
          <div className="consistency-grid">
            {Object.entries(report.consistencyCheck).map(([key, value]) => (
              <div key={key} className={`consistency-item ${value}`}>
                <span className="check-key">{key.replace(/_/g, " ")}</span>
                <span className={`check-value check-${value}`}>{value === "pass" ? "通过" : value === "partial" ? "部分" : "不通过"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 阻断问题 */}
        {report.blockingIssues.length > 0 && (
          <div className="issues-section blocking">
            <h4>阻断问题 ({report.blockingIssues.length})</h4>
            {report.blockingIssues.map((issue, i) => (
              <div key={i} className="issue-card blocking-issue">
                <div className="issue-header">
                  <span className="issue-type">{issue.type}</span>
                  <span className="issue-severity">{issue.severity}</span>
                </div>
                <p className="issue-desc">{issue.description}</p>
                <p className="issue-suggestion">建议：{issue.suggestion}</p>
              </div>
            ))}
          </div>
        )}

        {/* 非阻断问题 */}
        {report.nonBlockingIssues.length > 0 && (
          <div className="issues-section non-blocking">
            <h4>非阻断问题 ({report.nonBlockingIssues.length})</h4>
            {report.nonBlockingIssues.map((issue, i) => (
              <div key={i} className="issue-card">
                <div className="issue-header">
                  <span className="issue-type">{issue.type}</span>
                  <span className="issue-severity">{issue.severity}</span>
                </div>
                <p className="issue-desc">{issue.description}</p>
                <p className="issue-suggestion">建议：{issue.suggestion}</p>
              </div>
            ))}
          </div>
        )}

        {/* 下一步建议 */}
        <div className="next-action">
          <h4>下一步</h4>
          <p>{report.nextAction}</p>
        </div>

        {/* 证据 */}
        {report.evidence.length > 0 && (
          <div className="evidence-section">
            <h4>证据来源</h4>
            <ul className="evidence-list">
              {report.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
