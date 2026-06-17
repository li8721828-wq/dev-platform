import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { ArchitectureDiagram } from "./ArchitectureDiagram";

const GOLDEN_RATIO = 1.618;

// 配置 mermaid - 专业风格
mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    primaryColor: "#f0ecff",
    primaryTextColor: "#1a1a2e",
    primaryBorderColor: "#6c63ff",
    lineColor: "#b0b8c8",
    secondaryColor: "#e8f4fd",
    tertiaryColor: "#f5f3ff",
    fontSize: "14px",
    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    noteBkgColor: "#fff8e1",
    noteTextColor: "#333",
    noteBorderColor: "#f5c518",
    actorBkg: "#6c63ff",
    actorBorder: "#5548d9",
    actorTextColor: "#fff",
    actorLineColor: "#b0b8c8",
    signalColor: "#333",
    signalTextColor: "#333",
    labelBoxBkgColor: "#f0ecff",
    labelBoxBorderColor: "#6c63ff",
    labelTextColor: "#1a1a2e",
    loopTextColor: "#1a1a2e",
    activationBorderColor: "#6c63ff",
    activationBkgColor: "#f0ecff",
    sequenceNumberColor: "#fff",
  },
  flowchart: {
    htmlLabels: true,
    curve: "basis",
    padding: 15,
    nodeSpacing: 40,
    rankSpacing: 50,
    useMaxWidth: false,
  },
  securityLevel: "loose",
});

interface Props {
  content: string;
}

// Mermaid 图表组件 - 黄金比例布局
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");
  const idRef = React.useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, code.trim());
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  // 渲染后调整 SVG 比例为黄金比例
  React.useEffect(() => {
    if (!svg || !containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;

    // 获取 SVG 原始尺寸
    const bbox = svgEl.getBBox?.();
    if (!bbox || bbox.width === 0 || bbox.height === 0) return;

    const naturalRatio = bbox.width / bbox.height;
    // TB布局: 图更高（ratio < 1），LR布局: 图更宽（ratio > 1）
    // 黄金比例目标: 宽:高 ≈ 1.618:1
    const targetRatio = GOLDEN_RATIO;

    if (naturalRatio < targetRatio * 0.5) {
      // 太窄太高 - 增加宽度适配黄金比例
      const targetWidth = bbox.height * targetRatio;
      svgEl.setAttribute("width", `${targetWidth}`);
      svgEl.setAttribute("height", `${bbox.height}`);
    } else if (naturalRatio > targetRatio * 2.5) {
      // 太宽太矮 - 增加高度适配黄金比例
      const targetHeight = bbox.width / targetRatio;
      svgEl.setAttribute("width", `${bbox.width}`);
      svgEl.setAttribute("height", `${targetHeight}`);
    }
    svgEl.style.width = "100%";
    svgEl.style.height = "auto";
    svgEl.style.maxWidth = "100%";
  }, [svg]);

  if (error) {
    return <pre className="md-code-block" style={{ color: "#b42318" }}>图表渲染错误: {error}</pre>;
  }
  if (!svg) {
    return <div className="md-loading"><span className="ai-spinner"></span>渲染图表中...</div>;
  }
  return <div className="md-mermaid" ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// 主渲染组件
export function MarkdownRenderer({ content }: Props) {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 处理代码块 - 检测 mermaid
          code({ className, children, ...props }) {
            const codeString = String(children).replace(/\n$/, "");

            // 检测 architecture-json
            if (/language-architecture-json/.exec(className || "")) {
              try {
                const data = JSON.parse(codeString);
                return <ArchitectureDiagram data={data} />;
              } catch {
                return <pre className="md-code-block"><code>{codeString}</code></pre>;
              }
            }

            // 检测 mermaid
            const mermaidMatch = /language-mermaid/.exec(className || "");
            if (mermaidMatch || codeString.trim().match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitgraph)/)) {
              return <MermaidBlock code={codeString} />;
            }

            // 行内代码
            if (!className) {
              return <code className="md-inline-code" {...props}>{children}</code>;
            }

            // 普通代码块
            return (
              <pre className="md-code-block">
                <code {...props}>{children}</code>
              </pre>
            );
          },
          // 表格
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table className="md-table">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="md-th">{children}</th>,
          td: ({ children }) => <td className="md-td">{children}</td>,
          // 标题样式
          h1: ({ children }) => <h3 className="md-h1">{children}</h3>,
          h2: ({ children }) => <h3 className="md-h2">{children}</h3>,
          h3: ({ children }) => <h4 className="md-h3">{children}</h4>,
          // 列表样式
          ul: ({ children }) => <ul className="md-ul">{children}</ul>,
          ol: ({ children }) => <ol className="md-ol">{children}</ol>,
          li: ({ children }) => <li className="md-li">{children}</li>,
          // 段落
          p: ({ children }) => <p className="md-p">{children}</p>,
          // 强调
          strong: ({ children }) => <strong className="md-strong">{children}</strong>,
          // 水平线
          hr: () => <hr className="md-hr" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
