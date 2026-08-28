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
import { ClearOverrideDialog } from "./clear-override-dialog";
import { OverrideEditorSheet } from "./override-editor-sheet";

let restore: () => void = () => undefined;

beforeEach(() => {
  restore = installModalBrowser();
});
afterEach(() => restore());

describe("Location Settings modal behavior", () => {
  it("portals the editor, focuses inside, and cleans up on Escape", () => {
    const onClose = vi.fn();
    const harness = mountModal(
      <OverrideEditorSheet
        currency="AED"
        onClose={onClose}
        onSave={() => undefined}
        pending={false}
        projection={{
          setting: "valetServiceFee",
          default: "25.000",
          effective: "35.500",
          override: null,
          overridePresent: false,
        }}
      />,
    );
    const dialog = findAttribute("role", "dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("config.editor.titleSet");
    expect(harness.shell.contains(dialog)).toBe(false);
    expect(harness.shell.inert).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    harness.cleanup();
    expect(harness.shell.inert).toBe(false);
    expect(document.activeElement).toBe(harness.opener);
  });

  it("focuses Cancel in the clear dialog and restores the opener", () => {
    const onCancel = vi.fn();
    const harness = mountModal(
      <ClearOverrideDialog
        busy={false}
        onCancel={onCancel}
        onConfirm={() => undefined}
        settingLabel="Fee"
      />,
    );
    const dialog = findAttribute("role", "alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("config.clear.title");
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
