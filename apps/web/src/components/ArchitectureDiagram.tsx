import React from "react";

interface ArchNode {
  id: string;
  label: string;
  type: "service" | "module" | "gateway" | "database" | "infra" | "external";
}

interface ArchLayer {
  name: string;
  color: string;
  nodes: ArchNode[];
}

interface ArchConnection {
  from: string;
  to: string;
  label?: string;
}

interface ArchData {
  layers: ArchLayer[];
  connections: ArchConnection[];
}

function nodeIcon(type: ArchNode["type"]): string {
  switch (type) {
    case "gateway": return "⬡";
    case "database": return "⛁";
    case "external": return "☁";
    case "infra": return "⚙";
    case "module": return "▣";
    default: return "◈";
  }
}

// 测量文字宽度（近似）
function textWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    w += ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.58;
  }
  return w;
}

// ===== 重心排序 =====
function reorderLayers(data: ArchData): ArchLayer[] {
  const layers = data.layers.map(l => ({ ...l, nodes: [...l.nodes] }));

  // 上→下
  for (let li = 1; li < layers.length; li++) {
    const upperPos = new Map<string, number>();
    layers[li - 1].nodes.forEach((n, i) => upperPos.set(n.id, i));
    layers[li].nodes.sort((a, b) => {
      const ac = barycenter(a.id, upperPos, data.connections, "from");
      const bc = barycenter(b.id, upperPos, data.connections, "from");
      return ac - bc;
    });
  }
  // 下→上
  for (let li = layers.length - 2; li >= 0; li--) {
    const lowerPos = new Map<string, number>();
    layers[li + 1].nodes.forEach((n, i) => lowerPos.set(n.id, i));
    layers[li].nodes.sort((a, b) => {
      const ac = barycenter(a.id, lowerPos, data.connections, "to");
      const bc = barycenter(b.id, lowerPos, data.connections, "to");
      return ac - bc;
    });
  }
  return layers;
}

function barycenter(
  nodeId: string, others: Map<string, number>,
  connections: ArchConnection[], dir: "from" | "to"
): number {
  const rel = dir === "from"
    ? connections.filter(c => c.from === nodeId && others.has(c.to)).map(c => others.get(c.to)!)
    : connections.filter(c => c.to === nodeId && others.has(c.from)).map(c => others.get(c.from)!);
  return rel.length === 0 ? 0 : rel.reduce((s, v) => s + v, 0) / rel.length;
}

// ===== 布局 =====
function computeLayout(data: ArchData) {
  const PX = 60;
  const PY = 36;
  const PB = 24;
  const LAYER_GAP = 130;
  const NODE_GAP = 28;
  const LAYER_PAD = 22;
  const NODE_H = 48;
  const ICON_W = 34;
  const NODE_PAD = 20;
  const FONT = 12;

  const sorted = reorderLayers(data);

  // 计算每个节点的宽度（根据文字长度）
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const nodeLayer = new Map<string, ArchLayer>();

  // 先算每层每个节点的宽度
  const nodeWidths = new Map<string, number>();
  sorted.forEach(layer => {
    layer.nodes.forEach(node => {
      const tw = textWidth(node.label, FONT);
      const w = Math.max(100, tw + ICON_W + NODE_PAD);
      nodeWidths.set(node.id, w);
    });
  });

  // 计算总宽度
  let maxRowW = 0;
  sorted.forEach(layer => {
    let rowW = 0;
    layer.nodes.forEach((n, i) => {
      rowW += nodeWidths.get(n.id)!;
      if (i < layer.nodes.length - 1) rowW += NODE_GAP;
    });
    maxRowW = Math.max(maxRowW, rowW);
  });

  const totalW = Math.max(800, maxRowW + PX * 2);
  const totalH = PY + sorted.length * (NODE_H + LAYER_GAP + LAYER_PAD * 2) - LAYER_GAP + PB;

  // 计算节点位置
  sorted.forEach((layer, li) => {
    const layerY = PY + li * (NODE_H + LAYER_GAP + LAYER_PAD * 2);
    let rowW = 0;
    layer.nodes.forEach((n, i) => {
      rowW += nodeWidths.get(n.id)!;
      if (i < layer.nodes.length - 1) rowW += NODE_GAP;
    });
    let x = (totalW - rowW) / 2;

    layer.nodes.forEach(node => {
      const w = nodeWidths.get(node.id)!;
      pos.set(node.id, { x, y: layerY + LAYER_PAD, w, h: NODE_H });
      nodeLayer.set(node.id, layer);
      x += w + NODE_GAP;
    });
  });

  return { totalW, totalH, pos, sorted, nodeLayer, LAYER_GAP, LAYER_PAD, NODE_H };
}

// ===== 连线锚点分散 =====
function buildAnchors(
  connections: ArchConnection[],
  pos: Map<string, { x: number; y: number; w: number; h: number }>
) {
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  connections.forEach(c => {
    if (!pos.has(c.from) || !pos.has(c.to)) return;
    outCount.set(c.from, (outCount.get(c.from) || 0) + 1);
    inCount.set(c.to, (inCount.get(c.to) || 0) + 1);
  });
  const outI = new Map<string, number>();
  const inI = new Map<string, number>();
  outCount.forEach((_, k) => outI.set(k, 0));
  inCount.forEach((_, k) => inI.set(k, 0));

  const result: Array<{
    fx: number; fy: number; tx: number; ty: number;
    conn: ArchConnection; sameLayer: boolean
  }> = [];

  connections.forEach(c => {
    const f = pos.get(c.from);
    const t = pos.get(c.to);
    if (!f || !t) return;

    const sameLayer = Math.abs((f.y + f.h / 2) - (t.y + t.h / 2)) < 30;

    let fx: number, fy: number, tx: number, ty: number;

    if (sameLayer) {
      if (f.x < t.x) {
        fx = f.x + f.w; fy = f.y + f.h / 2;
        tx = t.x; ty = t.y + t.h / 2;
      } else {
        fx = f.x; fy = f.y + f.h / 2;
        tx = t.x + t.w; ty = t.y + t.h / 2;
      }
    } else {
      const fTotal = outCount.get(c.from) || 1;
      const tTotal = inCount.get(c.to) || 1;
      const fi = outI.get(c.from) || 0;
      const ti = inI.get(c.to) || 0;

      const fSpread = Math.min(50, f.w * 0.5);
      const fOff = fTotal === 1 ? 0 : (fi / (fTotal - 1) - 0.5) * fSpread;
      fx = f.x + f.w / 2 + fOff;
      fy = f.y + f.h;

      const tSpread = Math.min(50, t.w * 0.5);
      const tOff = tTotal === 1 ? 0 : (ti / (tTotal - 1) - 0.5) * tSpread;
      tx = t.x + t.w / 2 + tOff;
      ty = t.y;

      outI.set(c.from, fi + 1);
      inI.set(c.to, ti + 1);
    }

    result.push({ fx, fy, tx, ty, conn: c, sameLayer });
  });

  return result;
}

interface Props { data: ArchData; }

// 清洗数据：去重节点、去除无效连线
function sanitize(data: ArchData): ArchData {
  const seenIds = new Set<string>();
  const layers = data.layers.map(l => ({
    ...l,
    nodes: l.nodes.filter(n => {
      if (seenIds.has(n.id)) return false;
      seenIds.add(n.id);
      return true;
    })
  })).filter(l => l.nodes.length > 0);

  const connections = data.connections.filter(
    c => seenIds.has(c.from) && seenIds.has(c.to) && c.from !== c.to
  );

  return { layers, connections };
}

export function ArchitectureDiagram({ data }: Props) {
  const cleanData = sanitize(data);
  const { totalW, totalH, pos, sorted, nodeLayer, LAYER_GAP, LAYER_PAD, NODE_H } = computeLayout(cleanData);
  const anchors = buildAnchors(cleanData.connections, pos);

  return (
    <div className="arch-diagram-wrap">
      <svg viewBox={`0 0 ${totalW} ${totalH}`} className="arch-diagram-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="ds" x="-2%" y="-4%" width="104%" height="112%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#000" floodOpacity="0.04" />
          </filter>
          <filter id="nds" x="-4%" y="-8%" width="108%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.06" />
          </filter>
          <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <path d="M0 0L8 3L0 6L2 3Z" fill="#94a3b8" opacity="0.55" />
          </marker>
        </defs>

        {/* 层背景 */}
        {sorted.map((layer, i) => {
          const fp = pos.get(layer.nodes[0]?.id);
          if (!fp) return null;
          const y = fp.y - LAYER_PAD;
          const h = NODE_H + LAYER_PAD * 2;
          return (
            <g key={`bg${i}`}>
              <rect x={28} y={y} width={totalW - 56} height={h}
                rx={10} fill={layer.color} opacity={0.04}
                stroke={layer.color} strokeWidth={0.7} strokeOpacity={0.08} filter="url(#ds)" />
              <text x={42} y={y + 16} fontSize={10.5} fontWeight={600}
                fill={layer.color} opacity={0.5}
                fontFamily="Inter, system-ui, sans-serif">{layer.name}</text>
            </g>
          );
        })}

        {/* 连线 */}
        {anchors.map((a, i) => {
          const { fx, fy, tx, ty, conn, sameLayer } = a;
          const layer = nodeLayer.get(conn.from);
          const col = layer?.color || "#94a3b8";

          let d: string;
          let labelY: number;

          if (sameLayer) {
            const dist = Math.abs(tx - fx);
            const bulge = Math.min(dist * 0.4, 35);
            const sign = fx < tx ? 1 : -1;
            d = `M${fx},${fy} C${fx + bulge * sign},${fy - bulge} ${tx - bulge * sign},${ty - bulge} ${tx},${ty}`;
            labelY = Math.min(fy, ty) - bulge * 0.6;
          } else {
            const dy = ty - fy;
            d = `M${fx},${fy} C${fx},${fy + dy * 0.42} ${tx},${fy + dy * 0.58} ${tx},${ty}`;
            labelY = fy + dy * 0.48;
          }

          const labelX = (fx + tx) / 2;
          const lbl = conn.label || "";
          const lw = lbl ? textWidth(lbl, 9.5) + 10 : 0;
          const lh = 15;

          return (
            <g key={`c${i}`}>
              <path d={d} fill="none"
                stroke={sameLayer ? "#b0b8c8" : col}
                strokeWidth={sameLayer ? 1 : 1.3}
                strokeDasharray={sameLayer ? "5 3" : "none"}
                markerEnd="url(#arr)" opacity={sameLayer ? 0.35 : 0.3} />
              {lbl && lw > 0 && (
                <g>
                  <rect x={labelX - lw / 2} y={labelY - lh / 2} width={lw} height={lh}
                    rx={3} fill="#fff" stroke={col} strokeWidth={0.5} strokeOpacity={0.15} />
                  <text x={labelX} y={labelY + 3} textAnchor="middle"
                    fontSize={9.5} fill="#64748b"
                    fontFamily="Inter, system-ui, sans-serif">{lbl}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* 节点 */}
        {sorted.map(layer =>
          layer.nodes.map(node => {
            const p = pos.get(node.id);
            if (!p) return null;
            return (
              <g key={node.id} filter="url(#nds)">
                <rect x={p.x} y={p.y} width={p.w} height={p.h}
                  rx={8} fill="#fff" stroke={layer.color}
                  strokeWidth={1.3} strokeOpacity={0.4} />
                <rect x={p.x} y={p.y} width={3.5} height={p.h} rx={2} fill={layer.color} />
                <text x={p.x + 14} y={p.y + p.h / 2}
                  fontSize={12} fill={layer.color} opacity={0.7}
                  dominantBaseline="middle"
                  fontFamily="'Segoe UI Symbol', system-ui">{nodeIcon(node.type)}</text>
                <text x={p.x + 30} y={p.y + p.h / 2}
                  fontSize={12} fontWeight={500} fill="#1e293b"
                  dominantBaseline="middle"
                  fontFamily="Inter, 'Segoe UI', system-ui, sans-serif">{node.label}</text>
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
