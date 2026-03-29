import { ActionHandler, type RuntimeActionExecutor } from "./action-handler.js";

export function startApexActionHandling(
  sessionId: string,
  executor?: Partial<RuntimeActionExecutor>
): ActionHandler {
  const handler = new ActionHandler(sessionId, executor);
  handler.start();
  return handler;
}
