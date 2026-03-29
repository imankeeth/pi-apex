export interface HostSessionCapabilities {
  getMessages: boolean;
  getThread: boolean;
  getBranches: boolean;
  fork: boolean;
  switch: boolean;
  getActiveBranch: boolean;
}

export interface HostMessagingCapabilities {
  send: boolean;
  sendAsUser: boolean;
  sendAsSystem: boolean;
  append: boolean;
}

export interface HostUICapabilities {
  theme: boolean;
  tabs: boolean;
  panels: boolean;
}

export interface HostToolsCapabilities {
  getAll: boolean;
  getActive: boolean;
  setActive: boolean;
  call: boolean;
  intercept: boolean;
}

export interface HostCapabilities {
  session: HostSessionCapabilities;
  messaging: HostMessagingCapabilities;
  ui: HostUICapabilities;
  tools: HostToolsCapabilities;
}
