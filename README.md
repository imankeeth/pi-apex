# pi-apex

> A tabbed dock for [pi.dev](https://pi.dev) — build custom dev tools that give you visibility and control over your AI coding agent session.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Node](https://img.shields.io/badge/Node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

---

## What is this?

pi-apex wraps pi.dev with a two-panel UI. The **right panel** is the standard pi chat and tools. The **left panel** is an extensible plugin area — you control it entirely.

```
┌─────────────────────────────────────────────┐
│  pi-apex                                   │
├──────────────┬──────────────────────────────┤
│ [Thread Tree]│  pi.dev chat                 │
│ [Tools Log]  │                              │
│ [Files]      │  > Write me a fast API...   │
│ [Settings]   │                              │
├──────────────┴──────────────────────────────┤
│ Extensions: Thread Tree · Tools Log          │
└─────────────────────────────────────────────┘
```

The left panel is built with **extensions** — sandboxed iframes that get a typed SDK. Any framework works (React, Vue, Svelte, vanilla). The shell ships zero UI opinions.

---

## Examples of what you can build

**Visualizations**
- Thread tree: see your conversation as a branching tree of messages, tool calls, and results
- Token meter: real-time context window usage
- Cost tracker: per-session LLM spend estimator

**Tooling**
- Tools log: every tool call + result in a filterable, searchable table
- File diff viewer: show what pi wrote to your codebase
- Session replay: step backward/forward through a conversation

**Team / Workflow**
- Prompt library: save and replay useful prompts
- Agentic flow designer: drag-and-drop chain of reasoning steps
- Reviewer panel: post-session code review annotations synced to git

---

## Architecture

```
Extension iframe                    Shell (pi.dev)
┌─────────────────────────┐        ┌─────────────────────────┐
│ Your React/Vue/Svelte   │        │ Pure TypeScript         │
│ UI                      │        │ - Tab manager           │
│                         │        │ - Extension iframe      │
│  @pi-apex/sdk           │ ←──→   │   loader                │
│  @pi-apex/react-sdk     │        │ - SDK bridge            │
│  (hooks only)           │        │ - pi.dev session wiring │
└─────────────────────────┘        └─────────────────────────┘
```

- **Shell** — zero framework deps, pure TypeScript. Loads extensions from `/extensions/:id/bundle.js`
- **SDK** — framework-agnostic. Exports `createExtension()` and `IframeBridge`
- **React SDK** — thin hooks wrapping the SDK (`useSession`, `useTools`, `useMessaging`, `useEvents`, `useContext`)
- **Extensions** — bundled as IIFE `<script>` tags injected into sandboxed iframes

---

## Quick Start

```bash
# Clone
git clone https://github.com/imankeeth/pi-apex.git
cd pi-apex

# Install dependencies
npm install

# Build all packages
npm run build

# Start the UI server
cd packages/ui-server && npm run dev
```

Then open `http://localhost:3000` and configure your pi.dev endpoint.

---

## Packages

| Package | Description |
|---------|-------------|
| [`@pi-apex/sdk`](packages/sdk) | Framework-agnostic core — types, IframeBridge, `createExtension()` |
| [`@pi-apex/react-sdk`](packages/react-sdk) | React hooks — `useSession`, `useTools`, `useEvents`, `useMessaging`, `useContext` |
| [`@pi-apex/shell`](packages/shell) | Pure TS tab manager, iframe loader, SDK bridge wiring |
| [`@pi-apex/ui-server`](packages/ui-server) | Hono server serving shell + extensions |
| [`@pi-apex/thread-tree`](packages/extensions/thread-tree) | Default extension — conversation as a threaded tree |

---

## Building an Extension

### 1. Scaffold

```bash
cd packages/extensions
mkdir my-extension && cd my-extension
npm init -y
```

### 2. manifest.json

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "description": "What it does",
  "icon": "🔧",
  "type": "ui-extension",
  "entry": "/extensions/my-extension/bundle.js",
  "events": ["tool_call", "tool_result", "message"]
}
```

### 3. Register it

Add to `pi-apex.config.json` at the repo root:

```json
{
  "extensions": [
    { "id": "thread-tree", "enabled": true },
    { "id": "my-extension", "enabled": true }
  ],
  "pi": {
    "endpoint": "http://localhost:8080"
  }
}
```

### 4. Write the extension code

```tsx
// src/main.tsx
import { createExtension } from "@pi-apex/sdk";
import { PiProvider, useToolResult } from "@pi-apex/react-sdk";

function MyExtension() {
  useToolResult((tr) => {
    console.log("Tool result:", tr);
  });
  return <div>Hello from my extension</div>;
}

const entry = createExtension(
  { id: "my-extension", name: "My Extension", version: "0.1.0", type: "ui-extension", entry: "/extensions/my-extension/bundle.js" },
  (sdk) => {
    const root = document.getElementById("root")!;
    import("react-dom/client").then(({ createRoot }) => {
      const reactRoot = createRoot(root);
      reactRoot.render(
        <PiProvider sdk={sdk}>
          <MyExtension />
        </PiProvider>
      );
    });
    return () => { /* cleanup */ };
  }
);

export default entry;
```

### 5. Build

Add to the root `package.json` workspaces script, or use Vite directly:

```bash
npx vite build --config ./vite.config.ts
```

---

## SDK Reference

### `createExtension(manifest, initFn)`

Register an extension. Returns an `ExtensionEntry`.

```ts
const entry = createExtension(manifest, (sdk: PiSDK) => {
  // sdk.session — read messages, thread, context
  // sdk.messaging — send messages, tool results
  // sdk.tools — list available tools, intercept calls
  // sdk.events — subscribe to tool_call, tool_result, message, etc.
  // sdk.context — set context variables pi uses
  return () => { /* unmount */ };
});
```

### `PiSDK` surface

```ts
// Session
sdk.session.getMessages()           // Message[]
sdk.session.getThread()            // ThreadNode[]
sdk.session.getContext()           // Record<string, string>
sdk.session.fork(sessionId)        // fork a new session
sdk.session.switch(sessionId)      // switch active session

// Messaging
sdk.messaging.sendAsUser(text)     // send user message
sdk.messaging.sendToolResult(id, result)  // respond to a tool call

// Tools
sdk.tools.list()                   // ToolDefinition[]
sdk.tools.call(name, args)         // call a tool directly

// Events
sdk.events.onToolCall(handler)     // subscribe
sdk.events.onToolResult(handler)   // subscribe
sdk.events.onMessage(handler)       // subscribe
sdk.events.unsubscribe(handlerId)   // unsubscribe

// Context
sdk.context.set(key, value)        // set pi context variable
sdk.context.get(key)               // get pi context variable
```

---

## Deployment

**Local development:**
```bash
npm run dev
```

**Hono server (Node.js):**
```bash
cd packages/ui-server
npm run build
node dist/index.js
```

**Cloudflare Workers:**
```bash
# Swap @hono/node-server for @hono/cloudflare-workers in ui-server
npx wrangler deploy
```

**Docker:**
```bash
docker build -t pi-apex .
docker run -p 3000:3000 pi-apex
```

---

## Configuration

`pi-apex.config.json` at the repo root:

```json
{
  "extensions": [
    { "id": "thread-tree", "enabled": true }
  ],
  "pi": {
    "endpoint": "http://localhost:8080",
    "apiKey": "your-pi-api-key"
  },
  "server": {
    "port": 3000
  }
}
```

Environment variables (`pi-apex.env` or shell):

```
PI_ENDPOINT=http://localhost:8080
PI_API_KEY=your-key
PORT=3000
```

---

## License

MIT © [Ankeeth Suvarna](https://github.com/imankeeth)

See [LICENSE](LICENSE) for the full text.
