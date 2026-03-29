// ============================================================================
// @pi-apex/react-sdk — React hooks for building pi-apex extension UIs.
// No UI components. No rendering opinions. Just data + events.
// Developer brings their own UI.
// ============================================================================

export { PiProvider, usePi } from "./hooks/usePi.js";
export { useSessionStore } from "./hooks/useSessionStore.js";
export { useSession, type UseSessionReturn } from "./hooks/useSession.js";
export { useThread } from "./hooks/useThread.js";
export { useMessages } from "./hooks/useMessages.js";
export { useTools, type UseToolsReturn } from "./hooks/useTools.js";
export { useMessaging, type UseMessagingReturn } from "./hooks/useMessaging.js";
export { useContext_ as useContext, type UseContextReturn } from "./hooks/useContext.js";
export {
  useEvents,
  useOnToolCall,
  useOnToolResult,
  useOnMessage,
  type UseEventsOptions,
} from "./hooks/useEvents.js";
