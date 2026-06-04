/**
 * 部署配置面板 - 查看/编辑配置、AI 生成、预览 Dockerfile 等
 */
import React from "react";
import type { DeployConfig } from "@dev-platform/shared";
import { CodeEditor } from "./CodeEditor";

interface DeployConfigPanelProps {
  projectId: string;
  apiBaseUrl: string;
}

export function DeployConfigPanel({ projectId, apiBaseUrl }: DeployConfigPanelProps) {
  const [config, setConfig] = React.useState<DeployConfig | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editDockerfile, setEditDockerfile] = React.useState("");
  const [editCompose, setEditCompose] = React.useState("");
  const [editBuildCmd, setEditBuildCmd] = React.useState("");
  const [editStartCmd, setEditStartCmd] = React.useState("");
  const [validationResult, setValidationResult] = React.useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);

  React.useEffect(() => { loadConfig(); }, [projectId]);

  async function loadConfig() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/deploy-config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setEditDockerfile(data.dockerfile ?? "");
        setEditCompose(data.dockerCompose ?? "");
        setEditBuildCmd(data.buildCommand ?? "");
        setEditStartCmd(data.startCommand ?? "");
      }
    } catch { /* ignore */ }
  }

  async function generateConfig() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/generate-deploy-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error("生成失败");
      const data = await res.json();
      setConfig(data);
      setEditDockerfile(data.dockerfile ?? "");
      setEditCompose(data.dockerCompose ?? "");
      setEditBuildCmd(data.buildCommand ?? "");
      setEditStartCmd(data.startCommand ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "生成失败"); }
    finally { setLoading(false); }
  }

  async function saveConfig() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/deploy-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dockerfile: editDockerfile,
          dockerCompose: editCompose,
          buildCommand: editBuildCmd,
          startCommand: editStartCmd
        })
      });
      if (!res.ok) throw new Error("保存失败");
      const data = await res.json();
      setConfig(data);
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setLoading(false); }
  }

  async function validateConfig() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/validate-deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dockerfile: editDockerfile || config?.dockerfile,
          dockerCompose: editCompose || config?.dockerCompose,
          buildCommand: editBuildCmd || config?.buildCommand
        })
      });
      if (!res.ok) throw new Error("校验失败");
      const result = await res.json();
      setValidationResult(result);
    } catch (e) { setError(e instanceof Error ? e.message : "校验失败"); }
  }

  return (
    <div className="deploy-panel">
      <h2>部署配置</h2>
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panel-heading">
          <h3>配置管理</h3>
          <div>
            {!config && (
              <button className="primary" onClick={generateConfig} disabled={loading}>
                {loading ? "生成中..." : "AI 生成部署配置"}
              </button>
            )}
            {config && !editing && (
              <button onClick={() => setEditing(true)}>编辑</button>
            )}
            {editing && (
              <>
                <button className="primary" onClick={saveConfig} disabled={loading}>保存</button>
                <button onClick={() => setEditing(false)}>取消</button>
              </>
            )}
            <button onClick={validateConfig}>校验配置</button>
          </div>
        </div>

        {validationResult && (
          <div className={`validation-result ${validationResult.valid ? "valid" : "invalid"}`}>
            <h4>{validationResult.valid ? "配置有效" : "配置无效"}</h4>
            {validationResult.errors.length > 0 && (
              <ul className="error-list">
                {validationResult.errors.map((e, i) => <li key={i} className="error-item">{e}</li>)}
              </ul>
            )}
            {validationResult.warnings.length > 0 && (
              <ul className="warning-list">
                {validationResult.warnings.map((w, i) => <li key={i} className="warning-item">{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {config && (
          <div className="deploy-config-content">
            <div className="config-section">
              <h4>Dockerfile</h4>
              {editing ? (
                <CodeEditor value={editDockerfile} onChange={setEditDockerfile} language="dockerfile" height="300px" />
              ) : (
                <CodeEditor value={config.dockerfile || "# 未配置"} readOnly language="dockerfile" height="300px" />
              )}
            </div>

            <div className="config-section">
              <h4>docker-compose.yml</h4>
              {editing ? (
                <CodeEditor value={editCompose} onChange={setEditCompose} language="yaml" height="300px" />
              ) : (
                <CodeEditor value={config.dockerCompose || "# 未配置"} readOnly language="yaml" height="300px" />
              )}
            </div>

            <div className="config-section">
              <h4>环境变量</h4>
              {config.envVars?.length > 0 ? (
                <table className="env-table">
                  <thead><tr><th>KEY</th><th>VALUE</th><th>说明</th></tr></thead>
                  <tbody>
                    {config.envVars.map((env, i) => (
                      <tr key={i}>
                        <td><code>{env.key}</code></td>
                        <td><code>{env.value}</code></td>
                        <td>{env.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">无环境变量配置</div>
              )}
            </div>

            <div className="config-section">
              <h4>构建与启动</h4>
              {editing ? (
                <div className="form-grid">
                  <label>构建命令<input value={editBuildCmd} onChange={e => setEditBuildCmd(e.target.value)} /></label>
                  <label>启动命令<input value={editStartCmd} onChange={e => setEditStartCmd(e.target.value)} /></label>
                </div>
              ) : (
                <div>
                  <p>构建: <code>{config.buildCommand || "未配置"}</code></p>
                  <p>启动: <code>{config.startCommand || "未配置"}</code></p>
                </div>
              )}
            </div>
          </div>
        )}

        {!config && !loading && (
          <div className="empty">暂无部署配置。点击"AI 生成部署配置"开始。</div>
        )}
      </section>
    </div>
  );
}
