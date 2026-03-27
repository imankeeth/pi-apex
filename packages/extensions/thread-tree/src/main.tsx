// ============================================================================
// ThreadTree — default pi-apex extension.
// Visualizes the pi session as a threaded conversation tree.
// Built entirely with @pi-apex/react-sdk (data/hooks only, no UI primitives).
// ============================================================================

import { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { PiProvider, useSession, useMessaging, useOnToolCall, useOnToolResult, useOnMessage } from "@pi-apex/react-sdk";
import type { ThreadNode, ToolCall, ToolResult, Message } from "@pi-apex/sdk";

// ─── Tree model builder ───────────────────────────────────────────────────────

interface TreeState {
  nodes: ThreadNode[];
  currentUserNodeId: string | null;
  currentAssistantNodeId: string | null;
}

function buildInitialTree(messages: Message[], thread: ThreadNode[]): TreeState {
  if (thread.length > 0) {
    return { nodes: thread, currentUserNodeId: null, currentAssistantNodeId: null };
  }

  // Build tree from flat messages
  const nodes: ThreadNode[] = [];
  let currentUserNodeId: string | null = null;
  let currentAssistantNodeId: string | null = null;

  for (const msg of messages) {
    const node: ThreadNode = {
      id: msg.id,
      type: msg.role === "user" ? "user_message" : msg.role === "assistant" ? "assistant_message" : "system_message",
      label: truncate(msg.content, 60),
      content: msg.content,
      parentId: msg.role === "user" ? null : currentUserNodeId,
      children: [],
      depth: msg.role === "user" ? 0 : (currentUserNodeId ? 1 : 0),
      timestamp: msg.timestamp,
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

function truncate(s: string, max: number): string {
  const cleaned = s.replace(/\n+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function ThreadTreeApp(): JSX.Element {
  const { messages, thread: threadFromSession } = useSession();
  const { sendAsUser } = useMessaging();

  const [nodes, setNodes] = useState<ThreadNode[]>(() =>
    buildInitialTree(messages, threadFromSession).nodes
  );
  const [currentUserNodeId, setCurrentUserNodeId] = useState<string | null>(null);
  const [currentAssistantNodeId, setCurrentAssistantNodeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("all");

  // Sync when session changes
  useState(() => {
    const { nodes: n, currentUserNodeId: u, currentAssistantNodeId: a } = buildInitialTree(messages, threadFromSession);
    setNodes(n);
    setCurrentUserNodeId(u);
    setCurrentAssistantNodeId(a);
  });

  // Subscribe to new messages
  useOnMessage((msg: Message) => {
    const { nodes: n, currentUserNodeId: u, currentAssistantNodeId: a } = buildInitialTree([...messages, msg], []);
    setNodes(n);
    setCurrentUserNodeId(u);
    setCurrentAssistantNodeId(a);
  });

  // Append tool calls as children of the current assistant node
  useOnToolCall((tc: ToolCall) => {
    const node: ThreadNode = {
      id: tc.id,
      type: "tool_call",
      label: `⚡ ${tc.toolName}`,
      content: JSON.stringify(tc.args, null, 2),
      parentId: currentAssistantNodeId,
      children: [],
      depth: currentAssistantNodeId ? 2 : 1,
      timestamp: tc.timestamp,
    };
    setNodes((prev) => [...prev, node]);
  });

  // Append tool results as children of the tool call
  useOnToolResult((tr: ToolResult) => {
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
    setNodes((prev) => {
      const withChild = prev.map((n) =>
        n.id === tr.callId ? { ...n, children: [...n.children, node] } : n
      );
      return [...withChild, node];
    });
  });

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleReply = useCallback(
    (node: ThreadNode) => {
      const text = prompt(`Reply from: ${node.label}`);
      if (text) sendAsUser(text);
    },
    [sendAsUser]
  );

  // Filter nodes
  const visibleNodes = filterNodes(nodes, filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
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
    </div>
  );
}

function filterNodes(nodes: ThreadNode[], filter: string): ThreadNode[] {
  if (filter === "all") return nodes;
  if (filter === "tools") return nodes.filter((n) => n.type === "tool_call" || n.type === "tool_result");
  if (filter === "messages") return nodes.filter((n) => n.type === "user_message" || n.type === "assistant_message");
  return nodes;
}

// ─── Tree Node Row ───────────────────────────────────────────────────────────

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
  const INDENT = 20;

  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
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
          paddingLeft: depth * INDENT + 8,
          cursor: hasChildren ? "pointer" : "default",
          borderRadius: 4,
          transition: "background 0.1s",
        }}
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        title={node.content}
      >
        {/* Caret */}
        <span style={{ width: 14, flexShrink: 0, color: "var(--text-muted)", fontSize: 10 }}>
          {hasChildren ? (isExpanded ? "▼" : "▶") : ""}
        </span>

        {/* Icon */}
        <span style={{ flexShrink: 0 }}>{icons[node.type] ?? "•"}</span>

        {/* Label */}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", lineHeight: "16px" }}>
          {node.label}
        </span>

        {/* Type badge */}
        <span style={{
          flexShrink: 0,
          fontSize: 9,
          padding: "0 4px",
          borderRadius: 3,
          background: typeColors[node.type] ?? "#64748b",
          color: "white",
          fontWeight: 600,
          lineHeight: "16px",
        }}>
          {node.type.replace(/_/g, " ")}
        </span>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          expanded={expanded}
          onToggle={onToggle}
          onReply={onReply}
          depth={depth + 1}
        />
      ))}

      {/* Context menu */}
      {showMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setShowMenu(false)}
            onContextMenu={(e) => { e.preventDefault(); setShowMenu(false); }}
          />
          <div style={{
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
          }}>
            {[
              { label: "Reply to this point", icon: "💬", action: () => { onReply(node); setShowMenu(false); } },
              { label: "Fork from here", icon: "⑂", action: () => setShowMenu(false) },
              { label: "Copy content", icon: "📋", action: () => { navigator.clipboard.writeText(node.content); setShowMenu(false); } },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px",
                  background: "none", border: "none", cursor: "pointer",
                  borderRadius: 4, fontSize: 13, color: "var(--text)", textAlign: "left",
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

// ─── Toolbar button style ─────────────────────────────────────────────────────

const toolbarBtn: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
};

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

function bootstrap(sdk: Parameters<ReturnType<typeof PiProvider> extends JSX.Element ? never : never>): void {
  const root = document.getElementById("root");
  if (!root) return;
  const reactRoot = createRoot(root);
  reactRoot.render(
    <PiProvider sdk={sdk as never}>
      <ThreadTreeApp />
    </PiProvider>
  );
}

// ─── Extension entry ────────────────────────────────────────────────────────────

import { createExtension } from "@pi-apex/sdk";
import type { PiSDK } from "@pi-apex/sdk";

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
      // unmount
    };
  }
);

export default entry;
