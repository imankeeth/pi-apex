export type ApexEventType =
  | "session_registered"
  | "session_updated"
  | "message"
  | "message_delta"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "status"
  | "extension_notification"
  | "extension_command_registered"
  | "extension_state_changed";

export interface ApexEvent {
  type: ApexEventType;
  payload: unknown;
  ts: number;
}

export interface ApexEventEnvelope {
  sessionId: string;
  event: ApexEvent;
  ts: number;
}
