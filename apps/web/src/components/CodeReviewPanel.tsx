/**
 * 代码审查面板 - AI 审查结果展示、人工意见录入、审查报告
 */
import React from "react";
import type { CodeReviewRecord, ReviewIssue, HumanComment } from "@dev-platform/shared";

interface CodeReviewPanelProps {
  projectId: string;
  apiBaseUrl: string;
}

export function CodeReviewPanel({ projectId, apiBaseUrl }: CodeReviewPanelProps) {
  const [reviews, setReviews] = React.useState<CodeReviewRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requirements, setRequirements] = React.useState("");
  const [designDocId, setDesignDocId] = React.useState("");
  const [selectedReview, setSelectedReview] = React.useState<CodeReviewRecord | null>(null);
  const [newComment, setNewComment] = React.useState("");
  const [commentReviewer, setCommentReviewer] = React.useState("");

  React.useEffect(() => { loadReviews(); }, [projectId]);

  async function loadReviews() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/code-reviews`);
      const data = await res.json();
      setReviews(data.reviews ?? []);
    } catch { /* ignore */ }
  }

  async function startAiReview() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements, designDocId: designDocId || undefined, codeFiles: [] })
      });
      if (!res.ok) throw new Error("AI 审查失败");
      const result = await res.json();
      alert(`AI 审查完成，得分: ${result.overallScore}，发现 ${result.issues?.length ?? 0} 个问题`);
      await loadReviews();
    } catch (e) { setError(e instanceof Error ? e.message : "审查失败"); }
    finally { setLoading(false); }
  }

  async function addComment(reviewId: string) {
    if (!newComment.trim()) return;
    try {
      await fetch(`${apiBaseUrl}/api/code-reviews/${reviewId}/human-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewer: commentReviewer || "anonymous", content: newComment })
      });
      setNewComment("");
      await loadReviews();
    } catch { /* ignore */ }
  }

  async function finalizeReview(reviewId: string) {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/code-reviews/${reviewId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error("生成报告失败");
      await loadReviews();
      alert("审查报告已生成");
    } catch (e) { setError(e instanceof Error ? e.message : "生成报告失败"); }
    finally { setLoading(false); }
  }

  return (
    <div className="review-panel">
      <h2>代码审查</h2>
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panel-heading"><h3>启动 AI 审查</h3></div>
        <div className="form-grid">
          <label>
            需求描述
            <textarea value={requirements} onChange={e => setRequirements(e.target.value)} rows={3} placeholder="描述需求背景" />
          </label>
          <label>
            设计文档 ID（可选）
            <input value={designDocId} onChange={e => setDesignDocId(e.target.value)} placeholder="设计文档 ID" />
          </label>
          <button className="primary" onClick={startAiReview} disabled={loading}>
            {loading ? "审查中..." : "AI 代码审查"}
          </button>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h3>审查记录</h3></div>
          <div className="table">
            {reviews.map(review => (
              <div key={review.id} className="review-item" onClick={() => setSelectedReview(review)}>
                <div className="review-header">
                  <span><strong>{review.status}</strong></span>
                  <span>{review.aiReview?.length ?? 0} 个 AI 问题</span>
                  <span>{review.humanComments?.length ?? 0} 条人工意见</span>
                  <small>{new Date(review.createdAt).toLocaleString()}</small>
                </div>

                {selectedReview?.id === review.id && (
                  <div className="review-detail">
                    {review.aiReview.length > 0 && (
                      <div className="ai-issues">
                        <h4>AI 审查问题</h4>
                        {review.aiReview.map((issue, i) => (
                          <div key={i} className={`issue-item issue-${issue.severity}`}>
                            <span className={`severity-badge severity-${issue.severity}`}>{issue.severity}</span>
                            <span className="category-tag">{issue.category}</span>
                            <span>{issue.file}{issue.line ? `:${issue.line}` : ""}</span>
                            <p>{issue.description}</p>
                            <p className="suggestion">建议: {issue.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="human-comments-section">
                      <h4>人工意见</h4>
                      {review.humanComments.map((c, i) => (
                        <div key={i} className="comment-item">
                          <strong>{c.reviewer}</strong>
                          <span>{c.content}</span>
                          <em>{c.resolved ? "已解决" : "待处理"}</em>
                        </div>
                      ))}
                      <div className="add-comment-form">
                        <input value={commentReviewer} onChange={e => setCommentReviewer(e.target.value)} placeholder="审查人" />
                        <textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} placeholder="添加审查意见..." />
                        <button onClick={() => addComment(review.id)}>添加意见</button>
                      </div>
                    </div>

                    {review.status !== "finalized" && (
                      <button className="primary" onClick={() => finalizeReview(review.id)} disabled={loading}>
                        生成最终报告
                      </button>
                    )}

                    {Boolean(review.finalReport) && (
                      <div className="final-report">
                        <h4>最终审查报告</h4>
                        <pre>{JSON.stringify(review.finalReport, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
