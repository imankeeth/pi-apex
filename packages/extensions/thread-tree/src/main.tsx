// ============================================================================
// ThreadTree — default pi-apex extension.
// Visualizes the pi session as a threaded conversation tree.
// ============================================================================

import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { PiProvider, useSession, useMessaging, useOnToolCall, useOnToolResult, useOnMessage } from "@pi-apex/react-sdk";
import { createExtension, type PiSDK, type ThreadNode, type ToolCall, type ToolResult, type Message } from "@pi-apex/sdk";
import { ExtensionPanel } from "./components/ExtensionPanel";

// ─── Tree model builder ───────────────────────────────────────────────────────

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
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"tree" | "extensions">("tree");

  useEffect(() => {
    const { nodes: n, currentUserNodeId: u, currentAssistantNodeId: a } = buildInitialTree(messages, threadFromSession);
    setNodes(n);
    setCurrentUserNodeId(u);
    setCurrentAssistantNodeId(a);
  }, [messages, threadFromSession]);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-subtle)" }}>
        <button
          onClick={() => setView("tree")}
          style={{ ...toolbarBtn, background: view === "tree" ? "var(--bg-elevated)" : "transparent", color: view === "tree" ? "var(--accent)" : "var(--text-secondary)" }}
        >
          Tree
        </button>
        <button
          onClick={() => setView("extensions")}
          style={{ ...toolbarBtn, background: view === "extensions" ? "var(--bg-elevated)" : "transparent", color: view === "extensions" ? "var(--accent)" : "var(--text-secondary)" }}
        >
          Extensions
        </button>
      </div>

      {view === "extensions" ? (
        <ExtensionPanel onClose={() => setView("tree")} />
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <button
              onClick={() => setExpanded(new Set())}
              style={toolbarBtn}
            >
              Collapse all
            </button>
            <button
              onClick={() => setExpanded(new Set(visibleNodes.map((n) => n.id)))}
              style={toolbarBtn}
            >
              Expand all
            </button>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ ...toolbarBtn, cursor: "pointer" }}
            >
              <option value="all">All nodes</option>
              <option value="tools">Tools only</option>
              <option value="messages">Messages only</option>
            </select>
          </div>

          {/* Tree */}
          <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
            {visibleNodes.length === 0 ? (
              <div style={{ padding: "20px 12px", color: "var(--text-muted)", textAlign: "center" }}>
                No activity yet. Start a conversation with pi.
              </div>
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

          {/* Status bar */}
          <div style={{
            display: "flex",
            gap: 16,
            padding: "6px 12px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-subtle)",
            fontSize: 11,
            color: "var(--text-muted)",
            flexShrink: 0,
          }}>
            <span>{nodes.length} nodes</span>
            <span>{nodes.filter((n) => n.type === "tool_call").length} tool calls</span>
            <span>{nodes.filter((n) => n.type === "user_message").length} messages</span>
          </div>
        </>
      )}
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

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
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

const toolbarBtn: CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
};

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

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
