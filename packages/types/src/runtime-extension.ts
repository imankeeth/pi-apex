export interface RuntimeExtensionCommand {
  id: string;
  label: string;
  description?: string;
}

export interface RuntimeExtensionUiCapabilities {
  panel?: boolean;
  modal?: boolean;
  notifications?: boolean;
}

export interface RuntimeExtensionInfo {
  id: string;
  name: string;
  source: string;
  compatibility: string;
  commands: RuntimeExtensionCommand[];
  uiCapabilities: RuntimeExtensionUiCapabilities;
  status?: "active" | "inactive" | "error" | "loading";
}
