import type { ConfigurationSettingKey } from "@valet/contracts";

/**
 * Transient VIEW-local UI state for /location-settings (D4-003): which
 * setting's override editor is open and which setting has a pending clear
 * confirmation. Drafts live inside the (unmounting) editor component, so
 * closing the surfaces here discards them.
 *
 * LOCATION IDENTITY RESET BOUNDARY: the ONLY place transient UI survives is
 * this state, and the `location-changed` event clears ALL of it at once.
 * When the selected authorized location changes, no A editor, no A unsaved
 * draft and no A clear confirmation can remain visible under B — the page
 * then renders purely from B-authoritative controller state.
 */

export interface ConfigurationTransientUi {
  readonly editorOpenFor: ConfigurationSettingKey | null;
  readonly clearConfirmFor: ConfigurationSettingKey | null;
}

export function initialTransientUi(): ConfigurationTransientUi {
  return { clearConfirmFor: null, editorOpenFor: null };
}

export type TransientUiEvent =
  /** Identity boundary: emitted whenever the selected location changes. */
  | { readonly type: "location-changed"; readonly locationId: string }
  | { readonly setting: ConfigurationSettingKey; readonly type: "editor-opened" }
  | { readonly type: "editor-dismissed" }
  | {
      readonly setting: ConfigurationSettingKey;
      readonly type: "clear-requested";
    }
  /** Used for BOTH cancel and confirmed dispatch (dialog closes either way). */
  | { readonly type: "clear-dismissed" };

export function reduceTransientUi(
  state: ConfigurationTransientUi,
  event: TransientUiEvent,
): ConfigurationTransientUi {
  switch (event.type) {
    case "location-changed":
      return initialTransientUi();
    case "editor-opened":
      return { ...state, editorOpenFor: event.setting };
    case "editor-dismissed":
      return { ...state, editorOpenFor: null };
    case "clear-requested":
      return { ...state, clearConfirmFor: event.setting };
    case "clear-dismissed":
      return { ...state, clearConfirmFor: null };
  }
}
