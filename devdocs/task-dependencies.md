# pi-apex v1 — Task Dependency Chart

## Legend
```
[M1] = Milestone 1: Bridge Foundation
[M2] = Milestone 2: Runtime Registration
[M3] = Milestone 3: Action Routing
[M4] = Milestone 4: SDK + Thread Tree
[M5] = Milestone 5: Runtime Extension Surfacing
[M6] = Milestone 6: Compat Package Foundation
```

---

## PHASE 1: Infrastructure (No Deps — Parallelizable)

### T1 — Define shared TypeScript types
**Owner:** types
**Package:** new `packages/types/`
**Depends on:** None
**Description:** Extract all shared interfaces to a dedicated types package consumed by all other packages.
**Deliverables:**
- `packages/types/src/apex-session.ts` — ApexSessionInfo, ApexSessionSummary, ApexSessionSnapshot
- `packages/types/src/apex-event.ts` — ApexEvent, ApexEventEnvelope
- `packages/types/src/apex-action.ts` — ApexActionRequest, ApexActionResponse, RuntimeActionEnvelope
- `packages/types/src/host-capabilities.ts` — HostCapabilities
- `packages/types/src/runtime-extension.ts` — RuntimeExtensionInfo
- `packages/types/src/index.ts` — barrel export
- `packages/types/package.json`, `tsconfig.json`

---

### T2 — Add session registry to ui-server
**Owner:** ui-server
**Package:** `packages/ui-server`
**Depends on:** T1 (types)
**Description:** In-memory session registry with type-safe storage.
**Deliverables:**
- `packages/ui-server/src/registry.ts` — SessionRegistry class
  - `register(sessionId, snapshot)` → void
  - `get(sessionId)` → ApexSessionSnapshot | undefined
  - `getCurrent()` → ApexSessionSnapshot | undefined
  - `list()` → ApexSessionSummary[]
  - `setCurrent(sessionId)` → void
  - `update(sessionId, patch)` → void
  - `remove(sessionId)` → void

---

### T3 — Implement bridge endpoints (GET snapshot, list, current)
**Owner:** ui-server
**Package:** `packages/ui-server`
**Depends on:** T1 (types), T2 (registry)
**Description:** Add all read-only snapshot endpoints defined in §6.1 of the plan.
**Deliverables:**
- `GET /api/apex/sessions` → ListSessionsResponse
- `GET /api/apex/session/current` → ApexSessionSnapshot | null
- `GET /api/apex/session/:id` → ApexSessionSnapshot

---

### T4 — Implement SSE event stream endpoint
**Owner:** ui-server
**Package:** `packages/ui-server`
**Depends on:** T1 (types), T2 (registry)
**Description:** Add `GET /api/apex/session/:id/events` SSE streaming endpoint.
**Deliverables:**
- `packages/ui-server/src/sse.ts` — SSE utility (retry, keepalive, event format)
- `GET /api/apex/session/:id/events` → text/event-stream
  - Stores active SSE connections per session
  - Emits: session_registered, session_updated, message, message_delta, tool_call, tool_result, thinking, status, extension_notification, extension_command_registered, extension_state_changed
- `packages/ui-server/src/index.ts` update — wire SSE route

---

### T5 — Implement POST runtime event ingestion
**Owner:** ui-server
**Package:** `packages/ui-server`
**Depends on:** T1 (types), T2 (registry), T4 (SSE)
**Description:** Bridge receives events from runtime extension and fans out to SSE subscribers.
**Deliverables:**
- `POST /api/apex/runtime/event` → accepts ApexEventEnvelope, stores in session, broadcasts via SSE
- `POST /api/apex/runtime/register` → RegisterSessionRequest → RegisterSessionResponse (sessionId, url)
  - Sets newly registered session as current
  - Returns `url` pointing to session-specific shell URL

---

### T6 — Remove `:4201` WebSocket assumption from shell
**Owner:** shell
**Package:** `packages/shell`
**Depends on:** T1 (types)
**Description:** Replace the WebSocket transport in `shell.ts` with same-origin HTTP/SSE.
**Deliverables:**
- Remove `WS_URL = :4201` WebSocket client (`ApexWebSocket` class)
- Add `ApexHttp` class with:
  - `get(url)` — fetch wrapper
  - `post(url, body)` — POST wrapper
  - `sse(url, handlers)` — EventSource-based SSE subscriber
- Remove `apexWs` global; replace with `apexHttp` instance
- Update `buildSdkBridge()` to use `ApexHttp` instead of stubbed returns
- Session targeting: use `?session=<id>` from URL if present, else fetch `/api/apex/session/current`

---

### T7 — Add browser session store + SSE client in shell
**Owner:** shell
**Package:** `packages/shell`
**Depends on:** T1 (types), T6 (remove WS)
**Description:** A reactive in-browser store backed by bridge snapshot + live SSE events.
**Deliverables:**
- `packages/shell/src/store.ts` — ApexSessionStore class
  - Holds `ApexSessionSnapshot` as state
  - `subscribe(callback)` → unsubscribe fn
  - `get()` → current snapshot
  - Internally fetches snapshot then subscribes to SSE for live updates
- `packages/shell/src/sse-client.ts` — BrowserEventSource class wrapping EventSource
  - Auto-reconnect with exponential backoff
  - Parses `ApexEvent` from SSE data
- Update `PiApexShell` to create `ApexSessionStore` on start
- Pass store to `buildSdkBridge()` so SDK methods read from real store

---

### T8 — Add browser SDK action methods in shell
**Owner:** shell
**Package:** `packages/shell`
**Depends on:** T1 (types), T7 (store)
**Description:** Wire `POST /api/apex/action` calls from browser into the SDK bridge.
**Deliverables:**
- Update `buildSdkBridge()`:
  - `session.abort()`, `session.fork()`, `session.switch()`, `session.compact()` → `POST /api/apex/action`
  - `messaging.send()`, `messaging.steer()`, `messaging.followUp()` → `POST /api/apex/action`
- Add action result handling with timeout/error surfacing

---

## PHASE 2: Runtime Integration (Depends on Phase 1)

### T9 — Define Pi session snapshot gathering in pi-apex
**Owner:** pi-apex
**Package:** `packages/pi-apex`
**Depends on:** T1 (types)
**Description:** Functions to extract current Pi session state into ApexSessionSnapshot shape.
**Deliverables:**
- `packages/pi-apex/src/snapshot.ts`
  - `gatherSessionSnapshot(): ApexSessionSnapshot` — gathers session metadata, messages, thread, branches, tools, activeTools, extensions, capabilities
  - `gatherMessageHistory()` → Message[]
  - `gatherThread()` → ThreadNode[]
  - `gatherTools()` → ToolDef[] + activeTools string[]
  - `gatherRuntimeExtensions()` → RuntimeExtensionInfo[]
  - `gatherHostCapabilities()` → HostCapabilities
- Read current Pi session API to populate all fields (requires exploring Pi extension API)

---

### T10 — Implement runtime registration on `/apex` invocation
**Owner:** pi-apex
**Package:** `packages/pi-apex`
**Depends on:** T5 (register endpoint), T9 (snapshot gathering)
**Description:** When user runs `/apex`, gather snapshot and register with bridge.
**Deliverables:**
- Update `packages/pi-apex/src/extension.ts`:
  - On `/apex` command: call `gatherSessionSnapshot()`, POST to `/api/apex/runtime/register`
  - Parse returned sessionId + url
  - Open browser to returned `url` (with sessionId in query)
- `packages/pi-apex/src/http-client.ts` — minimal fetch client for runtime→bridge communication
  - `registerSession(snapshot) → RegisterSessionResponse`
  - `publishEvent(sessionId, event) → void`
  - `fetchCurrentSession() → ApexSessionSnapshot`

---

### T11 — Implement runtime event publishing
**Owner:** pi-apex
**Package:** `packages/pi-apex`
**Depends on:** T5 (event ingestion endpoint), T10 (registration)
**Description:** Stream live Pi events to bridge server via polling or event-driven hooks.
**Deliverables:**
- `packages/pi-apex/src/event-stream.ts` — RuntimeEventPublisher class
  - Subscribe to Pi internal event bus
  - Normalize Pi events → ApexEvent schema
  - `POST /api/apex/runtime/event` on each event
- Events to publish: message, message_delta, tool_call, tool_result, thinking, status, extension_notification, extension_state_changed
- `packages/pi-apex/src/extension.ts` update — initialize publisher on `/apex`

---

### T12 — Implement runtime action queue polling
**Owner:** pi-apex
**Package:** `packages/pi-apex`
**Depends on:** T8 (action endpoint), T10 (registration)
**Description:** Poll bridge for pending browser actions and execute them against live Pi session.
**Deliverables:**
- `GET /api/apex/runtime/actions/:sessionId` → RuntimeActionEnvelope[]
- `POST /api/apex/runtime/action-result` → acknowledge action result
- `packages/pi-apex/src/action-handler.ts` — ActionHandler class
  - Poll interval (every 1s)
  - Map actions to Pi session methods:
    - `session.prompt` → Pi send-message
    - `session.steer` → steer queue
    - `session.followUp` → follow-up queue
    - `session.abort` → abort active work
    - `session.compact` → compact current session
    - `session.fork` → fork branch
    - `session.switch` → switch branch/session
    - `extension.command.run` → execute registered runtime extension command
  - Post results back via `POST /api/apex/runtime/action-result`
- Update `extension.ts` to start action handler when `/apex` is invoked

---

## PHASE 3: SDK Refactor

### T13 — Refactor @pi-apex/sdk to bridge-backed APIs
**Owner:** sdk
**Package:** `packages/sdk`
**Depends on:** T1 (types), T6 (shell uses bridge)
**Description:** Replace stubbed SDK with real implementations backed by same-origin HTTP/SSE.
**Deliverables:**
- `packages/sdk/src/session.ts` — real Session API
  - `getMessages()` → fetch from bridge
  - `getThread()` → fetch from bridge
  - `getBranches()` → fetch from bridge
  - `fork()`, `switch()`, `abort()`, `compact()` → POST action
- `packages/sdk/src/messaging.ts` — real Messaging API
  - `prompt()`, `steer()`, `followUp()` → POST action
  - `sendAsUser()`, `sendAsSystem()` → POST action
- `packages/sdk/src/tools.ts` — real Tools API
  - `getAll()`, `getActive()` → fetch from bridge snapshot
  - `call()` → POST action
- `packages/sdk/src/events.ts` — SSE-backed events
  - `onMessage()`, `onToolCall()`, `onToolResult()`, `onThinking()` → SSE subscription
- `packages/sdk/src/context.ts` — real Context API
  - `get()` → fetch from bridge
- Update `packages/sdk/src/bridge.ts` — keep iframe bridge for shell↔extension; add bridge-client.ts for SDK→bridge HTTP/SSE
- Update `packages/sdk/src/index.ts` — export new APIs

---

### T14 — Refactor @pi-apex/react-sdk hooks
**Owner:** react-sdk
**Package:** `packages/react-sdk`
**Depends on:** T13 (sdk refactor)
**Description:** React hooks backed by real browser SDK.
**Deliverables:**
- `packages/react-sdk/src/hooks/useSession.ts` — useSession() consuming real SDK session API
- `packages/react-sdk/src/hooks/useMessages.ts` — useMessages() with live updates
- `packages/react-sdk/src/hooks/useThread.ts` — useThread() with live updates
- `packages/react-sdk/src/hooks/useTools.ts` — useTools() with live updates
- `packages/react-sdk/src/hooks/useMessaging.ts` — useMessaging() for send/steer/followUp
- `packages/react-sdk/src/hooks/useSessionStore.ts` — top-level session state hook
- Update `packages/react-sdk/src/index.ts`

---

## PHASE 4: Built-in Extension Updates

### T15 — Update Thread Tree to consume real snapshot/events
**Owner:** thread-tree extension
**Package:** `packages/extensions/thread-tree`
**Depends on:** T13 (sdk refactor), T14 (react-sdk hooks)
**Description:** Replace stubbed `useSession()` with real snapshot + SSE-backed hooks.
**Deliverables:**
- `packages/extensions/thread-tree/src/main.tsx` update:
  - Use `useSessionStore()` to get initial snapshot
  - Use `useMessages()` to subscribe to live message events
  - Use `useTools()` to display tool calls/results
  - Show session metadata (cwd, project, git branch, model) in header
  - Allow prompt reply via `useMessaging().prompt()`
- `packages/extensions/thread-tree/src/components/SessionHeader.tsx` — display session info
- `packages/extensions/thread-tree/src/components/MessageList.tsx` — render messages from snapshot + live events
- `packages/extensions/thread-tree/src/components/ToolMonitor.tsx` — render tool calls/results
- Update vite config if needed for new dependencies

---

## PHASE 5: Runtime Extension Surfacing

### T16 — Collect runtime extension registry
**Owner:** pi-apex
**Package:** `packages/pi-apex`
**Depends on:** T9 (snapshot gathering)
**Description:** Gather metadata about all registered Pi runtime extensions.
**Deliverables:**
- Extend `gatherRuntimeExtensions()` in snapshot.ts to enumerate all registered runtime extensions
- Include: id, name, source (project/global/package), compatibility tier, commands, uiCapabilities, status
- Publish `extension_notification` and `extension_state_changed` events when extensions register or change state

---

### T17 — Add runtime extension endpoints
**Owner:** ui-server
**Package:** `packages/ui-server`
**Depends on:** T2 (registry), T16 (extension registry)
**Description:** Expose runtime extension data via bridge API.
**Deliverables:**
- `GET /api/apex/extensions` → RuntimeExtensionInfo[] (from current session's snapshot)
- `GET /api/apex/capabilities` → HostCapabilities

---

### T18 — Build generic runtime extension panel UI
**Owner:** thread-tree extension (or new panel)
**Package:** `packages/extensions/thread-tree`
**Depends on:** T16 (extension registry), T17 (endpoints), T14 (react-sdk hooks)
**Description:** Generic surfacing of runtime extensions — commands, status, notifications.
**Deliverables:**
- `packages/extensions/thread-tree/src/components/ExtensionPanel.tsx`
  - Lists all registered runtime extensions
  - Shows each extension's commands (name, description)
  - Shows status badges
  - Allows executing commands via `extension.command.run` action
  - Shows recent extension notifications
- Integrate into Thread Tree UI as a tab or drawer

---

### T19 — Add cross-session relationship primitives
**Owner:** ui-server + shell
**Package:** `packages/ui-server`, `packages/shell`
**Depends on:** T2 (registry), T3 (list sessions)
**Description:** Session picker, project session explorer, cross-session tree.
**Deliverables:**
- `GET /api/apex/sessions` returns sessions with projectName/projectRoot for grouping
- Shell: add session picker dropdown in tab bar when multiple sessions exist
- Shell: expose session list via SDK for extension use
- UI primitive: `SessionPicker` component in shell or as SDK utility

---

## PHASE 6: Compat Package (Can Start Mid-Project)

### T20 — Create packages/compat
**Owner:** compat
**Package:** `packages/compat`
**Depends on:** T1 (types)
**Description:** Shared host abstractions and compatibility helpers.
**Deliverables:**
- `packages/compat/package.json`, `tsconfig.json`
- `packages/compat/src/normalize-event.ts` — `normalizeEvent(rawPiEvent) → ApexEvent`
- `packages/compat/src/host-abstraction.ts` — HostAbstraction interface + PiHost implementation
- `packages/compat/src/ui-adapters.ts` — browser toast/notification adapter, dialog adapters (notify, confirm, input, select)
- `packages/compat/src/index.ts` — barrel export
- No full compat extension authoring helpers in v1

---

## PHASE 7: Cleanup & Migration

### T21 — Remove standalone WebSocket bridge from pi-apex dist
**Owner:** pi-apex
**Package:** `packages/pi-apex`
**Depends on:** T6 (shell no longer uses WS), T12 (action queue)
**Description:** Ensure no code references `:4201` or assumes a separate WebSocket service.
**Deliverables:**
- Search entire codebase for `4201`, `WebSocket`, `ws://` references — remove or update all
- Ensure `packages/pi-apex/dist/` contains no WS client code
- Update README if it mentions 4201

---

### T22 — End-to-end integration test
**Owner:** all
**Depends on:** T8, T10, T11, T12, T15
**Description:** Verify full flow: `/apex` in Pi → browser opens → real session shown → live updates → actions work.
**Deliverables:**
- Manual test script in `devdocs/testing-checklist.md`
- Automated Playwright test (optional for v1)

---

## Dependency Matrix

```
T1  (types)                           ← NONE (root)
T2  (registry)                       ← T1
T3  (snapshot GET endpoints)         ← T1, T2
T4  (SSE stream)                      ← T1, T2
T5  (event ingestion + register)     ← T1, T2, T4
T6  (remove :4201 WS from shell)     ← T1
T7  (browser store + SSE client)     ← T1, T6
T8  (browser SDK action methods)     ← T1, T7
T9  (Pi snapshot gathering)          ← T1
T10 (runtime registration on /apex)   ← T5, T9
T11 (runtime event publishing)        ← T5, T10
T12 (runtime action queue polling)    ← T8, T10
T13 (SDK refactor)                    ← T1, T6
T14 (react-sdk hooks)                 ← T13
T15 (Thread Tree real data)           ← T13, T14
T16 (extension registry collection)   ← T9
T17 (extension endpoints)             ← T2, T16
T18 (extension panel UI)              ← T14, T16, T17
T19 (cross-session primitives)        ← T2, T3
T20 (compat package)                  ← T1
T21 (cleanup WS references)          ← T6, T12
T22 (E2E integration test)            ← T8, T10, T11, T12, T15
```

---

## Suggested Parallelization

**Stream A (Bridge/Server)** — T1 → T2 → T3 → T4 → T5 → T17 → T19
**Stream B (Shell/Browser)** — T1 → T6 → T7 → T8 → T13 → T14 → T15
**Stream C (Runtime/pi-apex)** — T1 → T9 → T10 → T11 → T12 → T16 → T18
**Stream D (Compat)** — T1 → T20 (can run parallel to all)

---

## Critical Path (Longest Chain)

```
T1 → T6 → T7 → T8 → T12
          ↘ (also needs T10)
T1 → T9 → T10 → T11 → T12
                ↘ (meets at T12)
T1 → T2 → T3 → ... (parallel streams above)
```

**Minimum viable sequence for first demo:**
1. T1 (types) must ship first
2. T2+T3+T4+T5 (bridge server) can run in parallel with T6+T7 (shell)
3. T9+T10 (runtime registration) needs T5
4. T8 (browser actions) needs T7
5. T12 (action queue) needs T8+T10 → enables full bi-directional flow

---

## Milestone Mapping

| Milestone | Key Tasks |
|---|---|
| M1: Bridge Foundation | T1, T2, T3, T4, T5, T6, T7 |
| M2: Runtime Registration | T9, T10, T11 |
| M3: Action Routing | T8, T12 |
| M4: SDK + Thread Tree | T13, T14, T15 |
| M5: Runtime Extension Surfacing | T16, T17, T18, T19 |
| M6: Compat Package | T20 |
| Cleanup | T21, T22 |
