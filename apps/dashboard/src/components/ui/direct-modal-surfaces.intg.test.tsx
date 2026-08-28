import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../i18n/locale-provider", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { DetailSheet } from "../../features/dashboard-overview/detail-sheet";
import { ConfirmDialog } from "../../features/map-setup/confirm-dialog";
import {
  findAttribute,
  installModalBrowser,
  mountModal,
  pressKey,
} from "./modal-behavior.test-double";

let restore: () => void = () => undefined;
beforeEach(() => {
  restore = installModalBrowser();
});
afterEach(() => restore());

describe("direct modal surface wiring", () => {
  it("portals and cleans up the Overview DetailSheet", () => {
    const onClose = vi.fn();
    const harness = mountModal(
      <DetailSheet title="Session" closeLabel="Close" onClose={onClose}>
        <button type="button">Action</button>
      </DetailSheet>,
    );
    const dialog = findAttribute("role", "dialog");
    expect(harness.shell.contains(dialog)).toBe(false);
    expect(harness.shell.inert).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => harness.root.unmount());
    expect(harness.shell.inert).toBe(false);
  });

  it("portals and focuses the safe action in Map ConfirmDialog", () => {
    const onCancel = vi.fn();
    const harness = mountModal(
      <ConfirmDialog
        body="Deactivate this area?"
        busy={false}
        onCancel={onCancel}
        onConfirm={() => undefined}
        title="Deactivate"
      />,
    );
    const dialog = findAttribute("role", "alertdialog");
    expect(harness.shell.contains(dialog)).toBe(false);
    expect(harness.shell.inert).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute("class")).toBe("btn-secondary");
    pressKey("Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
    harness.cleanup();
    expect(harness.shell.inert).toBe(false);
  });
});
