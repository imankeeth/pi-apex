// ============================================================================
// @pi-apex/sdk — Public exports
// Framework-agnostic. Pure data + events + extension bootstrap contract.
// ============================================================================

export type {
  PiSDK,
  SessionAPI,
  MessagingAPI,
  ToolsAPI,
  EventsAPI,
  ContextAPI,
  Unsubscribe,
  SessionContext,
  Message,
  SendOptions,
  ToolDef,
  ToolCall,
  ToolResult,
  ToolResultContent,
  InterceptHandler,
  ThreadNode,
  Branch,
  ThinkingState,
  SessionEventMap,
  ExtensionManifest,
} from "./types.js";

export { IframeBridge, createExtensionBridge } from "./bridge.js";
export { createExtension, loadExtensionBundle, type ExtensionEntry } from "./extension.js";
export type { MessageHandler } from "./bridge.js";
