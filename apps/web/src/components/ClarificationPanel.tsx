import React from "react";
import type { RequirementQuestion } from "@dev-platform/shared";

interface ClarificationAnswer {
  questionId: string;
  answer: string;
}

interface ClarificationRound {
  id: string;
  roundNo: number;
  questions: RequirementQuestion[];
  answers: ClarificationAnswer[];
  status: string;
}

interface ClarificationPanelProps {
  projectId: string;
  apiBaseUrl: string;
}

export function ClarificationPanel({ projectId, apiBaseUrl }: ClarificationPanelProps) {
  const [rounds, setRounds] = React.useState<ClarificationRound[]>([]);
  const [currentAnswers, setCurrentAnswers] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [expandedRound, setExpandedRound] = React.useState<number | null>(null);

  React.useEffect(() => {
    void loadHistory();
  }, [projectId]);

  async function loadHistory() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/clarification-history`);
      const data = await response.json();
      setRounds(data.rounds);
      if (data.rounds.length > 0) {
        setExpandedRound(data.rounds.length - 1);
      }
    } catch { /* ignore */ }
  }

  function handleAnswerChange(questionId: string, answer: string) {
    setCurrentAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }

  async function handleSubmitAnswers(roundId: string) {
    const answers = Object.entries(currentAnswers)
      .filter(([_, answer]) => answer.trim())
      .map(([questionId, answer]) => ({ questionId, answer: answer.trim() }));

    if (answers.length === 0) {
      setMessage("请至少回答一个问题");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/clarifications/${roundId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });

      if (response.ok) {
        setMessage("答案已保存");
        setCurrentAnswers({});
        await loadHistory();
      } else {
        setMessage("保存失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setLoading(false);
    }
  }

  async function handleFollowUp(roundId: string) {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/clarifications/${roundId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (response.ok) {
        setMessage("追问已生成");
        await loadHistory();
      } else {
        const data = await response.json();
        setMessage(data.message || "生成追问失败");
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setLoading(false);
    }
  }

  function getPriorityBadge(priority: string) {
    const colors: Record<string, string> = {
      blocking: "#b42318",
      high: "#a35f00",
      medium: "#2457d6",
      low: "#647087"
    };
    return (
      <span className="priority-badge" style={{ backgroundColor: colors[priority] || colors.low }}>
        {priority}
      </span>
    );
  }

  const currentRound = rounds.find((r) => r.status === "pending" || r.status === "answered");

  return (
    <div className="clarification-panel">
      <div className="panel-heading">
        <h3>澄清问答</h3>
        <span>{rounds.length} 轮</span>
      </div>

      {message && <div className="alert">{message}</div>}

      <div className="rounds-list">
        {rounds.length === 0 ? (
          <div className="empty">暂无澄清记录。请先进行需求分析。</div>
        ) : (
          rounds.map((round) => (
            <div key={round.id} className={`round-card ${expandedRound === round.roundNo ? "expanded" : ""}`}>
              <div className="round-header" onClick={() => setExpandedRound(expandedRound === round.roundNo ? null : round.roundNo)}>
                <strong>第 {round.roundNo} 轮</strong>
                <span className={`status-badge status-${round.status}`}>{round.status}</span>
                <span className="expand-icon">{expandedRound === round.roundNo ? "▼" : "▶"}</span>
              </div>

              {expandedRound === round.roundNo && (
                <div className="round-content">
                  {round.questions.map((question) => {
                    const existingAnswer = round.answers.find((a) => a.questionId === question.id)?.answer;
                    return (
                      <div key={question.id} className="question-card">
                        <div className="question-header">
                          <span className="question-id">{question.id}</span>
                          {getPriorityBadge(question.priority)}
                          <span className="category-tag">{question.category}</span>
                        </div>
                        <h4 className="question-text">{question.question}</h4>
                        <p className="why-needed">{question.whyNeeded}</p>

                        {existingAnswer ? (
                          <div className="answer-display">
                            <strong>业务反馈：</strong>{existingAnswer}
                          </div>
                        ) : (
                          <div className="answer-input">
                            <textarea
                              placeholder="录入业务反馈..."
                              value={currentAnswers[question.id] || ""}
                              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                              rows={3}
                            />
                            {question.candidateAnswers && question.candidateAnswers.length > 0 && (
                              <div className="candidate-answers">
                                <small>候选答案：</small>
                                {question.candidateAnswers.map((ca, i) => (
                                  <button
                                    key={i}
                                    className="candidate-btn"
                                    onClick={() => handleAnswerChange(question.id, ca)}
                                  >
                                    {ca}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {round.status === "pending" && Object.keys(currentAnswers).length > 0 && (
                    <button
                      className="primary"
                      onClick={() => handleSubmitAnswers(round.id)}
                      disabled={loading}
                    >
                      {loading ? "保存中..." : "提交答案"}
                    </button>
                  )}

                  {round.status === "answered" && (
                    <button
                      className="secondary"
                      onClick={() => handleFollowUp(round.id)}
                      disabled={loading}
                    >
                      {loading ? "生成中..." : "AI 追问"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
