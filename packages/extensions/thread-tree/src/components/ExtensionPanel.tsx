import { useEffect, useState, type CSSProperties } from "react";

interface ExtensionCommand {
  name: string;
  description?: string;
}

interface Extension {
  id: string;
  name: string;
  source: string;
  compatibility: string;
  commands: ExtensionCommand[];
  status?: string;
}

export function ExtensionPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/apex/extensions")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load extensions (${response.status})`);
        }
        return (await response.json()) as Extension[];
      })
      .then((data) => {
        if (cancelled) return;
        setExtensions(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div style={panelMessageStyle}>Loading extensions...</div>;
  }

  return (
    <div style={panelShellStyle}>
      <div style={panelHeaderStyle}>
        <h3 style={panelTitleStyle}>Runtime Extensions</h3>
        <button onClick={onClose} style={closeButtonStyle} aria-label="Close extensions panel">
          ×
        </button>
      </div>

      <div style={panelListStyle}>
        {error ? <div style={panelMessageStyle}>{error}</div> : null}

        {!error && extensions.length === 0 ? (
          <div style={panelMessageStyle}>No extensions registered</div>
        ) : null}

        {extensions.map((extension) => (
          <div key={extension.id} style={itemStyle}>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === extension.id ? null : extension.id)}
              style={itemHeaderButtonStyle}
            >
              <span style={nameStyle}>{extension.name}</span>
              <span style={{ ...badgeStyle, color: sourceColors[extension.source] ?? "#a1a1aa" }}>{extension.source}</span>
              {extension.status ? <span style={statusStyle}>{extension.status}</span> : null}
            </button>

            {expandedId === extension.id ? (
              <div style={detailsStyle}>
                <div style={metaRowStyle}>
                  <span>ID: {extension.id}</span>
                  <span>Compatibility: {extension.compatibility}</span>
                </div>

                {extension.commands.length > 0 ? (
                  <div>
                    <h4 style={sectionTitleStyle}>Commands</h4>
                    {extension.commands.map((command) => (
                      <button
                        key={command.name}
                        type="button"
                        style={commandButtonStyle}
                        onClick={() => {
                          fetch("/api/apex/action", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              sessionId: "current",
                              action: "extension.command.run",
                              payload: { commandId: command.name },
                            }),
                          }).catch(() => {});
                        }}
                      >
                        <span style={commandNameStyle}>/{command.name}</span>
                        {command.description ? <span style={commandDescriptionStyle}>{command.description}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const panelShellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "var(--bg)",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
};

const panelTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
};

const closeButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  fontSize: 22,
  cursor: "pointer",
  lineHeight: 1,
};

const panelListStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 8,
};

const panelMessageStyle: CSSProperties = {
  padding: 20,
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: 13,
};

const itemStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  marginBottom: 6,
  overflow: "hidden",
};

const itemHeaderButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  background: "var(--bg-subtle)",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
};

const nameStyle: CSSProperties = {
  fontWeight: 500,
  fontSize: 13,
  color: "var(--text)",
};

const badgeStyle: CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 4,
  background: "var(--bg-elevated)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const sourceColors: Record<string, string> = {
  project: "#6366f1",
  global: "#10b981",
  package: "#f59e0b",
};

const statusStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: 11,
  color: "var(--text-muted)",
};

const detailsStyle: CSSProperties = {
  padding: "10px 12px",
  background: "var(--bg)",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  fontSize: 11,
  color: "var(--text-secondary)",
  marginBottom: 10,
  flexWrap: "wrap",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  margin: "0 0 6px",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const commandButtonStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  width: "100%",
  padding: "6px 8px",
  background: "var(--bg-subtle)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  cursor: "pointer",
  textAlign: "left",
  marginBottom: 4,
};

const commandNameStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--accent)",
};

const commandDescriptionStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
};
