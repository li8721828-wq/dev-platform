import React from "react";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

interface FileTreeProps {
  projectId: string;
  apiBaseUrl: string;
  onFileSelect?: (path: string) => void;
}

export function FileTree({ projectId, apiBaseUrl, onFileSelect }: FileTreeProps) {
  const [tree, setTree] = React.useState<FileNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (projectId) {
      void loadTree("");
    }
  }, [projectId]);

  async function loadTree(path: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/tree?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || "加载文件树失败");
        return;
      }
      const data = await response.json();
      setTree(data.tree);
    } catch {
      setError("无法连接服务器");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(path: string) {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  }

  function handleFileClick(node: FileNode) {
    setSelectedPath(node.path);
    if (node.type === "directory") {
      toggleExpand(node.path);
    } else {
      onFileSelect?.(node.path);
    }
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function getFileIcon(node: FileNode): string {
    if (node.type === "directory") return expandedPaths.has(node.path) ? "📂" : "📁";
    const ext = node.name.split(".").pop()?.toLowerCase();
    if (["ts", "tsx", "js", "jsx"].includes(ext || "")) return "📜";
    if (["json"].includes(ext || "")) return "📋";
    if (["md", "txt"].includes(ext || "")) return "📝";
    if (["html", "css"].includes(ext || "")) return "🎨";
    return "📄";
  }

  function renderNode(node: FileNode, depth: number = 0): React.ReactNode {
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <div
          className={`file-tree-item ${isSelected ? "selected" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileClick(node)}
        >
          <span className="file-icon">{getFileIcon(node)}</span>
          <span className="file-name">{node.name}</span>
          {node.type === "file" && <span className="file-size">{formatSize(node.size)}</span>}
          {node.type === "directory" && <span className="expand-icon">{isExpanded ? "▼" : "▶"}</span>}
        </div>
        {node.type === "directory" && isExpanded && node.children && (
          <div className="file-tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-tree-panel">
        <div className="panel-heading">
          <h3>文件树</h3>
          <button onClick={() => loadTree("")} className="btn-small">重试</button>
        </div>
        <div className="file-tree-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="file-tree-panel">
      <div className="panel-heading">
        <h3>文件树</h3>
        <button onClick={() => loadTree("")} className="btn-small" disabled={loading}>
          {loading ? "加载中..." : "刷新"}
        </button>
      </div>
      <div className="file-tree-content">
        {tree.length === 0 ? (
          <div className="file-tree-empty">
            {loading ? "加载中..." : "请先导入项目（Git 克隆或本地路径）"}
          </div>
        ) : (
          tree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  );
}
