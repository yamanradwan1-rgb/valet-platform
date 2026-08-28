import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../i18n/locale-provider", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  findAttribute,
  installModalBrowser,
  mountModal,
  pressKey,
} from "../../components/ui/modal-behavior.test-double";
import { BrandingEditorDialog } from "./branding-editor-dialog";
import { ClearBrandingDialog } from "./clear-branding-dialog";

let restore: () => void = () => undefined;
beforeEach(() => {
  restore = installModalBrowser();
});
afterEach(() => restore());

describe("Branding modal behavior", () => {
  it("portals the editor and restores shell and opener after Escape", () => {
    const onClose = vi.fn();
    const harness = mountModal(
      <BrandingEditorDialog
        onClose={onClose}
        onSave={() => undefined}
        pending={false}
        projection={{ default: "VAYLET", effective: "VAYLET", override: null, overridePresent: false }}
        setting="brandDisplayName"
      />,
    );
    const dialog = findAttribute("role", "dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("branding.editor.titleSet");
    expect(harness.shell.contains(dialog)).toBe(false);
    expect(harness.shell.inert).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    harness.cleanup();
    expect(harness.shell.inert).toBe(false);
    expect(document.activeElement).toBe(harness.opener);
  });

  it("focuses Cancel in the clear dialog and cleans up", () => {
    const onCancel = vi.fn();
    const harness = mountModal(
      <ClearBrandingDialog
        busy={false}
        onCancel={onCancel}
        onConfirm={() => undefined}
        settingLabel="Color"
      />,
    );
    const dialog = findAttribute("role", "alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("branding.clear.title");
    expect(harness.shell.contains(dialog)).toBe(false);
    expect(harness.shell.inert).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute("class")).toBe("btn-secondary");
    pressKey("Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
    harness.cleanup();
    expect(harness.shell.inert).toBe(false);
    expect(document.activeElement).toBe(harness.opener);
  });
});
