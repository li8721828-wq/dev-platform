/**
 * 测试面板 - 生成测试、执行测试、查看结果
 */
import React from "react";
import type { TestRun } from "@dev-platform/shared";

interface TestingPanelProps {
  projectId: string;
  apiBaseUrl: string;
}

export function TestingPanel({ projectId, apiBaseUrl }: TestingPanelProps) {
  const [testRuns, setTestRuns] = React.useState<TestRun[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requirementText, setRequirementText] = React.useState("");
  const [designDocId, setDesignDocId] = React.useState("");
  const [selectedRun, setSelectedRun] = React.useState<TestRun | null>(null);

  React.useEffect(() => { loadTestRuns(); }, [projectId]);

  async function loadTestRuns() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/test-runs`);
      const data = await res.json();
      setTestRuns(data.testRuns ?? []);
    } catch { /* ignore */ }
  }

  async function generateTests() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/generate-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementText, designDocId: designDocId || undefined, codeFiles: [] })
      });
      if (!res.ok) throw new Error("生成失败");
      const run = await res.json();
      setSelectedRun(run);
      await loadTestRuns();
    } catch (e) { setError(e instanceof Error ? e.message : "生成失败"); }
    finally { setLoading(false); }
  }

  async function runTests(testRunId: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testRunId })
      });
      if (!res.ok) throw new Error("执行失败");
      await loadTestRuns();
      alert("测试执行完成");
    } catch (e) { setError(e instanceof Error ? e.message : "执行失败"); }
    finally { setLoading(false); }
  }

  return (
    <div className="testing-panel">
      <h2>自动测试</h2>
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panel-heading"><h3>生成测试用例</h3></div>
        <div className="form-grid">
          <label>
            需求描述
            <textarea value={requirementText} onChange={e => setRequirementText(e.target.value)} rows={3} placeholder="描述需要测试的需求" />
          </label>
          <label>
            设计文档 ID（可选）
            <input value={designDocId} onChange={e => setDesignDocId(e.target.value)} placeholder="设计文档 ID" />
          </label>
          <button className="primary" onClick={generateTests} disabled={loading}>
            {loading ? "生成中..." : "AI 生成测试"}
          </button>
        </div>
      </section>

      {selectedRun && (
        <section className="panel">
          <div className="panel-heading">
            <h3>测试计划 - {selectedRun.testCases?.length ?? 0} 个用例</h3>
            <button className="primary" onClick={() => runTests(selectedRun.id)} disabled={loading}>
              {loading ? "执行中..." : "执行测试"}
            </button>
          </div>
          <div className="test-cases-list">
            {selectedRun.testCases?.map((tc, i) => (
              <div key={i} className="test-case-item">
                <span className={`test-type test-type-${tc.type}`}>{tc.type}</span>
                <strong>{tc.name}</strong>
                <span>{tc.description}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {testRuns.length > 0 && (
        <section className="panel">
          <div className="panel-heading"><h3>测试历史</h3></div>
          <div className="table">
            {testRuns.map(run => (
              <div key={run.id} className="row-item" onClick={() => setSelectedRun(run)}>
                <span><strong>{run.status}</strong> - {run.testCases?.length ?? 0} 个用例</span>
                {run.summary && (
                  <span className="test-summary">
                    通过: {run.summary.passed} | 失败: {run.summary.failed} | 错误: {run.summary.error}
                  </span>
                )}
                <small>{new Date(run.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
