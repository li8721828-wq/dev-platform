/**
 * Monaco 代码编辑器组件
 */
import React from "react";
import Editor, { type OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  theme?: "vs" | "vs-dark";
}

function detectLanguage(filePath?: string): string {
  if (!filePath) return "plaintext";
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript",
    json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", html: "html", css: "css",
    scss: "scss", less: "less",
    py: "python", java: "java", go: "go",
    rs: "rust", sh: "shell", bash: "shell",
    sql: "sql", xml: "xml", toml: "ini",
    dockerfile: "dockerfile",
  };
  return langMap[ext ?? ""] ?? "plaintext";
}

export function CodeEditor({
  value,
  language = "typescript",
  onChange,
  readOnly = false,
  height = "500px",
  theme = "vs-dark"
}: CodeEditorProps) {
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    // 可以在这里自定义编辑器行为
    editor.getAction("editor.action.formatDocument")?.run();
  };

  return (
    <div className="code-editor-wrapper" style={{ border: "1px solid var(--line, #dfe4ec)", borderRadius: 4 }}>
      <Editor
        height={height}
        language={language}
        value={value}
        theme={theme}
        onChange={(v) => onChange?.(v ?? "")}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          wordWrap: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderWhitespace: "selection",
        }}
      />
    </div>
  );
}

export { detectLanguage };
