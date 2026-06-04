import React from "react";

interface GitImportProps {
  projectId: string;
  apiBaseUrl: string;
  onImportSuccess?: () => void;
}

export function GitImport({ projectId, apiBaseUrl, onImportSuccess }: GitImportProps) {
  const [gitUrl, setGitUrl] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleClone(event: React.FormEvent) {
    event.preventDefault();
    if (!gitUrl) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitUrl, branch: branch || undefined })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "克隆失败");
        return;
      }

      setSuccess(true);
      onImportSuccess?.();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="git-import">
      <form onSubmit={handleClone} className="git-import-form">
        <label>
          Git 仓库地址
          <input
            type="url"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            required
          />
        </label>
        <label>
          分支（可选）
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
          />
        </label>
        <button type="submit" disabled={loading || !gitUrl}>
          {loading ? "克隆中..." : "克隆仓库"}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">仓库克隆成功！</div>}
    </div>
  );
}
