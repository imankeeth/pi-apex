// ============================================================================
// ThreadTree — default pi-apex extension.
// Visualizes the pi session as a threaded conversation tree.
// ============================================================================

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  PiProvider,
  useContext as useSessionContext,
  useMessaging,
  useOnMessage,
  useOnToolCall,
  useOnToolResult,
  useSession,
} from "@pi-apex/react-sdk";
import { createExtension, type Message, type PiSDK, type ThreadNode, type ToolCall, type ToolResult } from "@pi-apex/sdk";

interface TreeState {
  nodes: ThreadNode[];
  currentUserNodeId: string | null;
  currentAssistantNodeId: string | null;
}

function truncate(value: string, max: number): string {
  const cleaned = value.replace(/\n+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function flattenNodes(nodes: ThreadNode[]): ThreadNode[] {
  const flat: ThreadNode[] = [];
  const visit = (node: ThreadNode) => {
    flat.push(node);
    for (const child of node.children) visit(child);
  };

  for (const node of nodes) visit(node);
  return flat;
}

function getAnchors(nodes: ThreadNode[]): Pick<TreeState, "currentUserNodeId" | "currentAssistantNodeId"> {
  let currentUserNodeId: string | null = null;
  let currentAssistantNodeId: string | null = null;

  for (const node of flattenNodes(nodes)) {
    if (node.type === "user_message") currentUserNodeId = node.id;
    if (node.type === "assistant_message") currentAssistantNodeId = node.id;
  }

  return { currentUserNodeId, currentAssistantNodeId };
}

function insertChild(nodes: ThreadNode[], parentId: string | null, child: ThreadNode): ThreadNode[] {
  if (!parentId) {
    return [...nodes, child];
  }

  let attached = false;

  const walk = (list: ThreadNode[]): ThreadNode[] =>
    list.map((node) => {
      if (node.id === parentId) {
        attached = true;
        return { ...node, children: [...node.children, child] };
      }

      if (node.children.length === 0) return node;
      const nextChildren = walk(node.children);
      if (nextChildren === node.children) return node;
      return { ...node, children: nextChildren };
    });

  const next = walk(nodes);
  return attached ? next : [...nodes, child];
}

function buildInitialTree(messages: Message[], thread: ThreadNode[]): TreeState {
  if (thread.length > 0) {
    const anchors = getAnchors(thread);
    return { nodes: thread, ...anchors };
  }

  const nodes: ThreadNode[] = [];
  let currentUserNodeId: string | null = null;
  let currentAssistantNodeId: string | null = null;

  for (const msg of messages) {
    const node: ThreadNode = {
      id: msg.id,
      type: msg.role === "user" ? "user_message" : msg.role === "assistant" ? "assistant_message" : msg.role === "system" ? "system_message" : "custom",
      label: truncate(msg.content, 60),
      content: msg.content,
      parentId: msg.role === "user" ? null : currentUserNodeId,
      children: [],
      depth: msg.role === "user" ? 0 : currentUserNodeId ? 1 : 0,
      timestamp: msg.timestamp,
      metadata: msg.metadata,
    };
    nodes.push(node);

    if (msg.role === "user") {
      currentUserNodeId = node.id;
      currentAssistantNodeId = null;
    } else if (msg.role === "assistant") {
      currentAssistantNodeId = node.id;
    }
  }

  return { nodes, currentUserNodeId, currentAssistantNodeId };
}

function appendMessage(
  prev: TreeState,
  msg: Message
): TreeState {
  const node: ThreadNode = {
    id: msg.id,
    type: msg.role === "user" ? "user_message" : msg.role === "assistant" ? "assistant_message" : msg.role === "system" ? "system_message" : "custom",
    label: truncate(msg.content, 60),
    content: msg.content,
    parentId: msg.role === "user" ? null : prev.currentUserNodeId,
    children: [],
    depth: msg.role === "user" ? 0 : prev.currentUserNodeId ? 1 : 0,
    timestamp: msg.timestamp,
    metadata: msg.metadata,
  };

  return {
    nodes: insertChild(prev.nodes, node.parentId, node),
    currentUserNodeId: msg.role === "user" ? node.id : prev.currentUserNodeId,
    currentAssistantNodeId: msg.role === "assistant" ? node.id : prev.currentAssistantNodeId,
  };
}

function appendToolCall(prev: TreeState, tc: ToolCall): TreeState {
  const node: ThreadNode = {
    id: tc.id,
    type: "tool_call",
    label: `⚡ ${tc.toolName}`,
    content: JSON.stringify(tc.args, null, 2),
    parentId: prev.currentAssistantNodeId,
    children: [],
    depth: prev.currentAssistantNodeId ? 2 : 1,
    timestamp: tc.timestamp,
  };

  return { ...prev, nodes: insertChild(prev.nodes, node.parentId, node) };
}

function appendToolResult(prev: TreeState, tr: ToolResult): TreeState {
  const resultText = tr.content?.[0]?.type === "text" ? tr.content[0].text ?? "" : JSON.stringify(tr.content);
  const node: ThreadNode = {
    id: tr.id,
    type: "tool_result",
    label: `✅ ${tr.toolName}`,
    content: truncate(resultText, 100),
    parentId: tr.callId,
    children: [],
    depth: 3,
    timestamp: tr.timestamp,
  };

  return { ...prev, nodes: insertChild(prev.nodes, node.parentId, node) };
}

function filterNodes(nodes: ThreadNode[], filter: string): ThreadNode[] {
  if (filter === "all") return nodes;
  if (filter === "tools") return nodes.filter((node) => node.type === "tool_call" || node.type === "tool_result");
  if (filter === "messages") return nodes.filter((node) => node.type === "user_message" || node.type === "assistant_message");
  return nodes;
}

function ThreadTreeApp(): JSX.Element {
  const { messages, thread, branches, activeBranch } = useSession();
  const { context } = useSessionContext();
  const { send, prompt, sendAsUser } = useMessaging();

  const [tree, setTree] = useState<TreeState>(() => buildInitialTree(messages, thread));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"send" | "prompt">("prompt");

  useEffect(() => {
    setTree(buildInitialTree(messages, thread));
  }, [messages, thread]);

  useOnMessage((msg: Message) => {
    setTree((prev) => appendMessage(prev, msg));
  });

  useOnToolCall((tc: ToolCall) => {
    setTree((prev) => appendToolCall(prev, tc));
  });

  useOnToolResult((tr: ToolResult) => {
    setTree((prev) => appendToolResult(prev, tr));
  });

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleReply = useCallback(
    (node: ThreadNode) => {
      const text = window.prompt(`Reply from: ${node.label}`);
      if (text) void sendAsUser(text);
    },
    [sendAsUser]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;

      if (deliveryMode === "send") {
        void send(text, { deliverAs: "user" });
      } else {
        void prompt(text);
      }
      setDraft("");
    },
    [deliveryMode, draft, prompt, send]
  );

  const visibleNodes = filterNodes(tree.nodes, filter);
  const sessionMeta = context ?? null;

  return (
    <div style={appShell}>
      <div style={header}>
        <div style={headerTitle}>Thread Tree</div>
        <div style={headerMeta}>
          <span>{sessionMeta?.cwd || "Unknown cwd"}</span>
          <span>{sessionMeta?.projectName || "Unknown project"}</span>
          <span>{sessionMeta?.gitBranch ? `branch ${sessionMeta.gitBranch}` : "no branch"}</span>
          <span>{sessionMeta?.model ? `model ${sessionMeta.model}` : "model unknown"}</span>
        </div>
      </div>

      <div style={toolbar}>
        <button onClick={() => setExpanded(new Set())} style={toolbarBtn}>Collapse all</button>
        <button onClick={() => setExpanded(new Set(visibleNodes.map((node) => node.id)))} style={toolbarBtn}>Expand all</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...toolbarBtn, cursor: "pointer" }}>
          <option value="all">All nodes</option>
          <option value="tools">Tools only</option>
          <option value="messages">Messages only</option>
        </select>
      </div>

      <div style={treePane}>
        {visibleNodes.length === 0 ? (
          <div style={emptyState}>No activity yet. Start a conversation with pi.</div>
        ) : (
          visibleNodes.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              expanded={expanded}
              onToggle={toggleExpanded}
              onReply={handleReply}
              depth={0}
            />
          ))
        )}
      </div>

      <div style={composer}>
        <div style={statusRow}>
          <span>{tree.nodes.length} nodes</span>
          <span>{tree.nodes.filter((node) => node.type === "tool_call").length} tool calls</span>
          <span>{tree.nodes.filter((node) => node.type === "user_message").length} messages</span>
          <span>{branches.length} branches</span>
          <span>{activeBranch ? `active ${activeBranch.label}` : "no active branch"}</span>
        </div>
        <form onSubmit={handleSubmit} style={composerForm}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message or prompt..."
            style={composerInput}
          />
          <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as "send" | "prompt")} style={deliverySelect}>
            <option value="prompt">Prompt</option>
            <option value="send">Send</option>
          </select>
          <button type="submit" style={composerButton}>Run</button>
        </form>
      </div>
    </div>
  );
}

interface TreeNodeRowProps {
  node: ThreadNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onReply: (node: ThreadNode) => void;
  depth: number;
}

function TreeNodeRow({ node, expanded, onToggle, onReply, depth }: TreeNodeRowProps): JSX.Element {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const indent = 20;

  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setMenuPos({ x: event.clientX, y: event.clientY });
    setShowMenu(true);
  };

  const typeColors: Record<string, string> = {
    user_message: "#6366f1",
    assistant_message: "#10b981",
    tool_call: "#f59e0b",
    tool_result: "#22c55e",
    system_message: "#64748b",
    custom: "#8b5cf6",
  };

  const icons: Record<string, string> = {
    user_message: "👤",
    assistant_message: "🤖",
    tool_call: "⚡",
    tool_result: "✅",
    system_message: "🔧",
    custom: "📎",
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          padding: "2px 8px",
          paddingLeft: depth * indent + 8,
          cursor: hasChildren ? "pointer" : "default",
          borderRadius: 4,
          transition: "background 0.1s",
        }}
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
        onContextMenu={handleContextMenu}
        onMouseEnter={(event) => (event.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        title={node.content}
      >
        <span style={{ width: 14, flexShrink: 0, color: "var(--text-muted)", fontSize: 10 }}>
          {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
        </span>

        <span style={{ flexShrink: 0 }}>{icons[node.type] ?? "•"}</span>

        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", lineHeight: "16px" }}>
          {node.label}
        </span>

        <span
          style={{
            flexShrink: 0,
            fontSize: 9,
            padding: "0 4px",
            borderRadius: 3,
            background: typeColors[node.type] ?? "#64748b",
            color: "white",
            fontWeight: 600,
            lineHeight: "16px",
          }}
        >
          {node.type.replace(/_/g, " ")}
        </span>
      </div>

      {isExpanded &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.id}
            node={child}
            expanded={expanded}
            onToggle={onToggle}
            onReply={onReply}
            depth={depth + 1}
          />
        ))}

      {showMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setShowMenu(false)}
            onContextMenu={(event) => {
              event.preventDefault();
              setShowMenu(false);
            }}
          />
          <div
            style={{
              position: "fixed",
              left: menuPos.x,
              top: menuPos.y,
              zIndex: 1000,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 4,
              minWidth: 180,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {[
              { label: "Reply to this point", icon: "💬", action: () => { onReply(node); setShowMenu(false); } },
              { label: "Fork from here", icon: "⑂", action: () => setShowMenu(false) },
              { label: "Copy content", icon: "📋", action: () => { void navigator.clipboard.writeText(node.content); setShowMenu(false); } },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 10px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 4,
                  fontSize: 13,
                  color: "var(--text)",
                  textAlign: "left",
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const appShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 12,
};

const header: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.03), transparent)",
  flexShrink: 0,
};

const headerTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
};

const headerMeta: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  color: "var(--text-muted)",
  fontSize: 11,
};

const toolbar: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
};

const treePane: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "8px 0",
};

const emptyState: CSSProperties = {
  padding: "20px 12px",
  color: "var(--text-muted)",
  textAlign: "center",
};

const composer: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "8px 12px",
  borderTop: "1px solid var(--border)",
  background: "var(--bg-subtle)",
  flexShrink: 0,
};

const statusRow: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  color: "var(--text-muted)",
  fontSize: 11,
};

const composerForm: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const composerInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 12,
};

const deliverySelect: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  fontFamily: "inherit",
  fontSize: 12,
};

const composerButton: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--accent)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const toolbarBtn: CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
};

function bootstrap(sdk: PiSDK): void {
  const root = document.getElementById("root");
  if (!root) return;

  createRoot(root).render(
    <PiProvider sdk={sdk}>
      <ThreadTreeApp />
    </PiProvider>
  );
}

const entry = createExtension(
  {
    id: "thread-tree",
    name: "Thread Tree",
    version: "0.1.0",
    description: "View your pi conversation as a threaded tree",
    icon: "🌳",
    type: "ui-extension",
    entry: "/extensions/thread-tree/bundle.js",
  },
  (sdk: PiSDK) => {
    bootstrap(sdk);
    return () => {
      // Unmount is handled by the shell iframe lifecycle.
    };
  }
);

export default entry;
