import { bridgeBase, getPendingActions, submitActionResult, type ApexActionRequest } from "./http-client.js";

export interface RuntimeActionExecutor {
  executePrompt(payload: unknown): Promise<unknown> | unknown;
  executeAbort(): Promise<void> | void;
  executeSteer(payload: unknown): Promise<void> | void;
  executeFollowUp(payload: unknown): Promise<void> | void;
  executeCompact(): Promise<void> | void;
  executeFork(payload: unknown): Promise<unknown> | unknown;
  executeSwitch(payload: unknown): Promise<void> | void;
  executeExtensionCommand(payload: unknown): Promise<unknown> | unknown;
}

function createDefaultExecutor(): RuntimeActionExecutor {
  const unconfigured = (name: string) => {
    throw new Error(`ActionHandler executor is not configured for ${name}`);
  };

  return {
    executePrompt: async () => unconfigured("session.prompt"),
    executeAbort: async () => unconfigured("session.abort"),
    executeSteer: async () => unconfigured("session.steer"),
    executeFollowUp: async () => unconfigured("session.followUp"),
    executeCompact: async () => unconfigured("session.compact"),
    executeFork: async () => unconfigured("session.fork"),
    executeSwitch: async () => unconfigured("session.switch"),
    executeExtensionCommand: async () => unconfigured("extension.command.run"),
  };
}

export class ActionHandler {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly executor: RuntimeActionExecutor;

  constructor(private readonly sessionId: string, executor?: Partial<RuntimeActionExecutor>) {
    this.executor = { ...createDefaultExecutor(), ...executor };
  }

  start(): void {
    if (this.pollInterval) {
      return;
    }

    void this.poll();
    this.pollInterval = setInterval(() => {
      void this.poll();
    }, 1000);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const actions = await getPendingActions(this.sessionId);
      for (const action of actions) {
        await this.handleAction(action);
      }
    } catch {
      // Silently ignore poll errors.
    }
  }

  private async handleAction(action: ApexActionRequest): Promise<void> {
    let result: unknown;
    let error: string | undefined;

    try {
      switch (action.action) {
        case "session.prompt":
          result = await this.executor.executePrompt(action.payload);
          break;
        case "session.abort":
          await this.executor.executeAbort();
          break;
        case "session.steer":
          await this.executor.executeSteer(action.payload);
          break;
        case "session.followUp":
          await this.executor.executeFollowUp(action.payload);
          break;
        case "session.compact":
          await this.executor.executeCompact();
          break;
        case "session.fork":
          result = await this.executor.executeFork(action.payload);
          break;
        case "session.switch":
          await this.executor.executeSwitch(action.payload);
          break;
        case "extension.command.run":
          result = await this.executor.executeExtensionCommand(action.payload);
          break;
        default:
          error = `Unknown action: ${action.action}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    await submitActionResult({
      actionId: action.id ?? `${action.sessionId}:${Date.now()}`,
      ok: !error,
      result,
      error,
    });
  }
}

export { bridgeBase };
