// ============================================================================
// usePi — provides the full PiSDK to any React component
// Uses React context so any component deep in the tree can access it.
// ============================================================================

import { createContext, useContext, type ReactNode } from "react";
import type { PiSDK } from "@pi-apex/sdk";

// The context — null when not mounted in a pi-apex shell
const PiContext = createContext<PiSDK | null>(null);

interface PiProviderProps {
  sdk: PiSDK;
  children: ReactNode;
}

export function PiProvider({ sdk, children }: PiProviderProps): JSX.Element {
  return <PiContext.Provider value={sdk}>{children}</PiContext.Provider>;
}

/**
 * usePi — access the full PiSDK from any component.
 * Throws if called outside the pi-apex shell context.
 */
export function usePi(): PiSDK {
  const sdk = useContext(PiContext);
  if (!sdk) {
    throw new Error(
      "usePi() must be called inside a component mounted by pi-apex shell. " +
      "Make sure your extension is loaded as a pi-apex UI tab."
    );
  }
  return sdk;
}
