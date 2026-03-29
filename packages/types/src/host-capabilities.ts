export interface HostCapabilities {
  session: {
    fork: boolean;
    switch: boolean;
    compact: boolean;
    abort: boolean;
  };
  messaging: {
    prompt: boolean;
    steer: boolean;
    followUp: boolean;
  };
  ui: {
    notify: boolean;
    confirm: boolean;
    input: boolean;
    select: boolean;
    form: boolean;
    customView: boolean;
  };
  tools: {
    call: boolean;
    intercept: boolean;
  };
}
