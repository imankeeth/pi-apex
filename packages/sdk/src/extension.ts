// ============================================================================
// createExtension — the contract an extension bundle exports.
// Shell calls this to bootstrap the extension with the SDK.
// ============================================================================

import type { PiSDK, ExtensionManifest } from "./types.js";

export interface ExtensionEntry {
  manifest: ExtensionManifest;
  mount(sdk: PiSDK): (() => void) | void;
  unmount?(): void;
}

export function createExtension(
  manifest: ExtensionManifest,
  setup: (sdk: PiSDK) => (() => void) | void
): ExtensionEntry {
  return {
    manifest,
    mount(sdk: PiSDK) {
      const cleanup = setup(sdk);
      // Return unmount handler
      return () => {
        if (typeof cleanup === "function") cleanup();
      };
    },
  };
}

// ─── Shell-side: load an extension bundle and get its entry ───────────────────

export async function loadExtensionBundle(
  entryPath: string
): Promise<ExtensionEntry> {
  const mod = await import(/* @vite-ignore */ entryPath);
  // Support default export or named 'default' export
  const entry: ExtensionEntry = mod.default ?? mod;
  if (!entry.manifest || !entry.mount) {
    throw new Error(
      `Extension at ${entryPath} does not export a valid extension entry ` +
      `(expected { manifest, mount }).`
    );
  }
  return entry;
}
