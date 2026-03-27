// ============================================================================
// pi-apex UI Server — Hono-based server that serves the shell and extensions.
// Minimal: just static file serving + config + pi backend proxy.
// ============================================================================

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "../../.."); // pi-apex root

// ─── Config ───────────────────────────────────────────────────────────────────

interface PiApexConfig {
  extensions: ExtensionSource[];
  theme?: "dark" | "light";
  defaults?: {
    activeTab?: string;
    tabOrder?: string[];
  };
}

type ExtensionSource =
  | { type: "builtin"; id: string }
  | { type: "npm"; name: string }
  | { type: "local"; path: string };

function loadConfig(): PiApexConfig {
  try {
    const raw = readFileSync(join(ROOT, "pi-apex.config.json"), "utf8");
    return JSON.parse(raw) as PiApexConfig;
  } catch {
    // Default config — just load built-in extensions
    return {
      extensions: [
        { type: "builtin", id: "thread-tree" },
        { type: "builtin", id: "tool-monitor" },
      ],
      theme: "dark",
    };
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new Hono();

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
});

app.options("*", (c) => c.text("", 204));

// ─── Shell HTML ───────────────────────────────────────────────────────────────

app.get("/", (c) => {
  const config = loadConfig();
  const shellHtmlPath = join(ROOT, "dist/shell/index.html");
  let html: string;

  try {
    html = readFileSync(shellHtmlPath, "utf8");
  } catch {
    // Fallback inline shell HTML (used during dev without building)
    html = getInlineShellHtml(config);
  }

  return c.html(html);
});

// ─── Shell JS bundle ───────────────────────────────────────────────────────────

app.get("/shell.js", (c) => {
  const bundlePath = join(ROOT, "dist/shell/shell.js");
  try {
    const js = readFileSync(bundlePath, "utf8");
    return c.body(js, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return c.text("shell.js not found — run: pi-apex build", 404);
  }
});

// ─── Extension manifests ─────────────────────────────────────────────────────

app.get("/extensions/:id/manifest.json", (c) => {
  const { id } = c.req.param();
  const config = loadConfig();
  const ext = config.extensions.find((e) => ("id" in e ? e.id === id : false));

  if (!ext) return c.json({ error: "Extension not found" }, 404);

  if (ext.type === "builtin") {
    const manifestPath = join(ROOT, "dist/extensions", id, "manifest.json");
    try {
      const manifest = readFileSync(manifestPath, "utf8");
      return c.json(JSON.parse(manifest));
    } catch {
      return c.json({ error: "Builtin extension manifest not found" }, 404);
    }
  }

  // For npm / local — resolve and load manifest
  return c.json({ error: "npm/local extension loading not yet implemented" }, 501);
});

// ─── Extension JS bundle ───────────────────────────────────────────────────────

app.get("/extensions/:id/bundle.js", (c) => {
  const { id } = c.req.param();
  const bundlePath = join(ROOT, "dist/extensions", id, "bundle.js");

  try {
    const js = readFileSync(bundlePath, "utf8");
    return c.body(js, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return c.text(`Extension bundle not found: ${id}`, 404);
  }
});

// ─── pi backend proxy ─────────────────────────────────────────────────────────

app.all("/api/pi/:path*", async (c) => {
  const path = c.req.param("path");
  const piBackend = process.env.PI_BACKEND_URL ?? "http://localhost:3000";

  const url = `${piBackend}/${path}`;
  const body = c.req.raw.body ? await c.req.raw.clone().text() : undefined;

  try {
    const res = await fetch(url, {
      method: c.req.method,
      headers: {
        "Content-Type": "application/json",
        ...Object.fromEntries(
          Object.entries(c.req.headers).filter(([k]) =>
            !["content-length", "content-type"].includes(k.toLowerCase())
          )
        ),
      },
      body: c.req.method !== "GET" && body ? body : undefined,
    });

    const text = await res.text();
    return c.body(text, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    return c.json({ error: `pi backend unreachable: ${err}` }, 502);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PI_APEX_PORT ?? "4200", 10);

console.log(`
╔═══════════════════════════════════════╗
║         pi-apex UI Server             ║
║  Local:   http://localhost:${PORT}      ║
║  Config:  ${join(ROOT, "pi-apex.config.json")}
╚═══════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port: PORT,
});

function getInlineShellHtml(config: PiApexConfig): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>pi-apex</title>
  <style>
    :root {
      --bg: #0f0f0f;
      --bg-subtle: #1a1a1a;
      --bg-elevated: #222222;
      --bg-hover: #2a2a2a;
      --bg-input: #1a1a1a;
      --border: #333333;
      --text: #e5e5e5;
      --text-secondary: #a1a1a1;
      --text-muted: #666666;
      --accent: #6366f1;
      --accent-hover: #818cf8;
      --font-mono: "Fira Code", "Cascadia Code", monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      height: 100vh;
      overflow: hidden;
    }
    #pi-apex-root {
      display: flex;
      height: 100vh;
    }
    #pi-apex-left {
      width: 380px;
      min-width: 300px;
      max-width: 600px;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #pi-apex-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #pi-apex-iframe-container {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .pi-apex-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: none;
    }
    .pi-apex-iframe.active { display: block; }
  </style>
</head>
<body>
  <div id="pi-apex-root">
    <div id="pi-apex-left">
      <!-- Tab bar injected by shell.js -->
      <div id="tab-bar"></div>
      <!-- Active extension iframe -->
      <div id="pi-apex-iframe-container">
        <iframe id="pi-apex-ext-iframe" class="pi-apex-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>
    </div>
    <div id="pi-apex-right">
      <!-- pi.dev chat — injected by pi itself or proxied -->
      <iframe id="pi-chat-iframe" style="width:100%;height:100%;border:none;" src="${process.env.PI_CHAT_URL ?? "about:blank"}"></iframe>
    </div>
  </div>
  <script type="module" src="/shell.js"></script>
  <script>
    window.__PI_APEX_CONFIG__ = ${JSON.stringify(config)};
  </script>
</body>
</html>`;
}
