import React from "react";

interface ProviderInfo {
  id: string;
  name: string;
  envKey: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  apiType: string;
  available: boolean;
  hasEnvKey?: boolean;
}

interface SavedProvider {
  id: string;
  providerId: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  isActive: boolean;
  createdAt: string;
}

interface AiConfigProps {
  apiBaseUrl: string;
}

export function AiConfig({ apiBaseUrl }: AiConfigProps) {
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [savedProviders, setSavedProviders] = React.useState<SavedProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [model, setModel] = React.useState("");
  const [detectedModels, setDetectedModels] = React.useState<string[]>([]);
  const [detecting, setDetecting] = React.useState(false);
  const [detectMessage, setDetectMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  React.useEffect(() => {
    void loadProviders();
    void loadSavedProviders();
  }, []);

  React.useEffect(() => {
    setDetectedModels([]);
    setDetectMessage(null);
  }, [selectedProvider, apiKey, baseUrl]);

  async function loadProviders() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/ai-providers`);
      const data = await response.json();
      setProviders(data.providers);
    } catch { /* ignore */ }
  }

  async function loadSavedProviders() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/ai-providers/configured`);
      const data = await response.json();
      setSavedProviders(data.providers ?? []);
    } catch { /* ignore */ }
  }

  function handleProviderChange(providerId: string) {
    setSelectedProvider(providerId);
    const provider = providers.find((p) => p.id === providerId);
    if (provider) {
      setModel(provider.defaultModel);
      setBaseUrl(provider.baseUrl || "");
      setDetectedModels([]);
    }
  }

  async function detectModels() {
    if (!selectedProvider || !apiKey) return;
    setDetecting(true);
    setDetectMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/ai-providers/test-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selectedProvider, apiKey, baseUrl: baseUrl || undefined })
      });

      const data = await response.json();
      if (data.models && data.models.length > 0) {
        setDetectedModels(data.models);
        const provider = providers.find((p) => p.id === selectedProvider);
        const defaultModel = provider?.defaultModel ?? "";
        const match = data.models.find((m: string) => m === defaultModel || m.includes(defaultModel));
        setModel(match ?? data.models[0]);
        if (data.source === "api") {
          setDetectMessage(`检测到 ${data.count} 个可用模型`);
        } else if (data.source === "fallback") {
          setDetectMessage("连接失败，已加载默认模型列表");
        } else {
          setDetectMessage(data.message ?? `已加载 ${data.models.length} 个模型`);
        }
      } else {
        setDetectMessage("未检测到可用模型，请检查 API Key 和 Base URL");
      }
    } catch {
      setDetectMessage("网络错误，无法检测模型");
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProvider || !apiKey || !model) return;
    setLoading(true);
    setMessage(null);

    try {
      const provider = providers.find((p) => p.id === selectedProvider);
      const response = await fetch(`${apiBaseUrl}/api/ai-providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedProvider,
          name: provider?.name || selectedProvider,
          apiKey,
          baseUrl: baseUrl || undefined,
          model,
          isActive: true
        })
      });

      if (response.ok) {
        setMessage({ type: "success", text: "AI 提供商配置已保存并启用" });
        setApiKey("");
        setSelectedProvider("");
        setDetectedModels([]);
        await loadSavedProviders();
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(sp: SavedProvider) {
    try {
      await fetch(`${apiBaseUrl}/api/ai-providers/${sp.id}/activate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !sp.isActive })
      });
      await loadSavedProviders();
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此配置？")) return;
    try {
      await fetch(`${apiBaseUrl}/api/ai-providers/${id}`, { method: "DELETE" });
      await loadSavedProviders();
    } catch { /* ignore */ }
  }

  const providerIcons: Record<string, string> = {
    openai: "🟢", anthropic: "🟠", deepseek: "🔵", moonshot: "🌙",
    qwen: "☁️", volcengine: "🔥", google: "🔴", openrouter: "🌐", ollama: "💻"
  };

  return (
    <div className="ai-config-panel">
      {/* 已保存的配置 */}
      <section className="saved-providers-section">
        <div className="section-header">
          <h3>已保存的配置</h3>
          <span className="section-count">{savedProviders.length} 个</span>
        </div>

        {savedProviders.length === 0 ? (
          <div className="empty-saved">
            <p>暂无已保存的 AI 配置，请在下方添加。</p>
          </div>
        ) : (
          <div className="saved-provider-cards">
            {savedProviders.map((sp) => (
              <div key={sp.id} className={`saved-card ${sp.isActive ? "active" : ""}`}>
                <div className="saved-card-header">
                  <span className="saved-card-icon">{providerIcons[sp.providerId] ?? "🤖"}</span>
                  <div className="saved-card-info">
                    <strong className="saved-card-name">{sp.name}</strong>
                    <span className="saved-card-model">{sp.model}</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${sp.isActive ? "on" : "off"}`}
                    onClick={() => handleToggle(sp)}
                    title={sp.isActive ? "点击停用" : "点击启用"}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
                {sp.baseUrl && (
                  <div className="saved-card-detail">
                    <span className="detail-label">URL</span>
                    <span className="detail-value">{sp.baseUrl}</span>
                  </div>
                )}
                <div className="saved-card-detail">
                  <span className="detail-label">Key</span>
                  <span className="detail-value">{sp.apiKey}</span>
                </div>
                <div className="saved-card-actions">
                  <button className="btn-delete" onClick={() => handleDelete(sp.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 添加新配置 */}
      <section className="add-provider-section">
        <div className="section-header">
          <h3>添加新配置</h3>
        </div>

        <form onSubmit={handleSave} className="ai-config-form">
          <label>
            选择提供商
            <select value={selectedProvider} onChange={(e) => handleProviderChange(e.target.value)}>
              <option value="">请选择...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {providerIcons[p.id] ?? "🤖"} {p.name} {p.hasEnvKey ? "(已有环境变量)" : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedProvider && (
            <>
              <label>
                API Key
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  required
                />
              </label>
              <label>
                Base URL
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="留空使用默认地址"
                />
              </label>

              <div className="model-select-row">
                <label className="flex-1">
                  模型
                  {detectedModels.length > 0 ? (
                    <select value={model} onChange={(e) => setModel(e.target.value)} required>
                      {detectedModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="先点击检测模型，或手动输入"
                      required
                    />
                  )}
                </label>
                <button type="button" className="detect-btn" onClick={detectModels} disabled={detecting || !apiKey}>
                  {detecting ? "检测中..." : "检测模型"}
                </button>
              </div>
              {detectMessage && <small className="detect-hint">{detectMessage}</small>}

              <button type="submit" disabled={loading || !apiKey || !model}>
                {loading ? "保存中..." : "保存并启用"}
              </button>
            </>
          )}
        </form>

        {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      </section>
    </div>
  );
}
