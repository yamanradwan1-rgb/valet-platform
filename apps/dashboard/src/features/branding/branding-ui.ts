import type { BrandingSetting } from "@valet/contracts";

/**
 * Transient VIEW-local UI state for /branding (D4-004): which setting's
 * override editor is open and which setting has a pending clear
 * confirmation. Drafts live inside the (unmounting) editor component, so
 * closing the surfaces here discards them.
 *
 * LOCATION IDENTITY RESET BOUNDARY: the ONLY place transient UI survives is
 * this state, and the `location-changed` event clears ALL of it at once.
 * When the selected authorized location changes, no A editor, no A unsaved
 * draft and no A clear confirmation can remain visible under B — the page
 * surface is additionally KEYED by location id, so the whole component (and
 * with it this state) unmounts on a switch by construction.
 */

export interface BrandingTransientUi {
  readonly clearConfirmFor: BrandingSetting | null;
  readonly editorOpenFor: BrandingSetting | null;
}

export function initialBrandingTransientUi(): BrandingTransientUi {
  return { clearConfirmFor: null, editorOpenFor: null };
}

export type BrandingTransientUiEvent =
  /** Identity boundary: emitted whenever the selected location changes. */
  | { readonly locationId: string; readonly type: "location-changed" }
  | { readonly setting: BrandingSetting; readonly type: "editor-opened" }
  | { readonly type: "editor-dismissed" }
  | {
      readonly setting: BrandingSetting;
      readonly type: "clear-requested";
    }
  /** Used for BOTH cancel and confirmed dispatch (dialog closes either way). */
  | { readonly type: "clear-dismissed" };

export function reduceBrandingTransientUi(
  state: BrandingTransientUi,
  event: BrandingTransientUiEvent,
): BrandingTransientUi {
  switch (event.type) {
    case "location-changed":
      return initialBrandingTransientUi();
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
