export interface RuntimeExtensionCommand {
  name: string;
  description?: string;
}

export interface RuntimeExtensionInfo {
  id: string;
  name: string;
  source: string;
  compatibility: string;
  commands: RuntimeExtensionCommand[];
  uiCapabilities: string[];
  status?: string;
}
