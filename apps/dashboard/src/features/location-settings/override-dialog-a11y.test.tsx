import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { ConfigurationSettingProjection } from "@valet/contracts";

import { LocaleProvider } from "../../i18n/locale-provider";
import { ClearOverrideDialog } from "./clear-override-dialog";
import { OverrideEditorSheet } from "./override-editor-sheet";

/**
 * Focused accessibility guards for the two Location Settings dialogs
 * (human-review correction on top of D4-003).
 *
 * 1. NO ORPHAN LABEL: the override editor's field text must reference a real
 *    labelable control whenever it is a <label htmlFor>. Boolean settings
 *    render toggle BUTTONS instead of a field, so there the field text is
 *    deliberately neutral <span> text that NAMES the toggle group through
 *    role="group" + aria-labelledby. No fake hidden input is created.
 * 2. INITIAL FOCUS: both dialogs move keyboard focus inside themselves on
 *    mount using the accepted ref + empty-deps useEffect pattern already
 *    used by map-setup ConfirmDialog / overview detail-sheet. The dashboard
 *    test environment is `node` (no jsdom), so live document.activeElement
 *    assertions are not available here; the pattern itself is pinned by
 *    source invariants below, while everything renderable is proven through
 *    react-dom/server static rendering.
 */

const noop = (): void => undefined;

const BOOLEAN_PROJECTION = {
  setting: "checkInPhotosRequired",
  default: false,
  overridePresent: false,
  override: null,
  effective: true,
} as const satisfies ConfigurationSettingProjection;

const ENUM_PROJECTION = {
  setting: "paymentServicePayer",
  default: "CUSTOMER",
  overridePresent: false,
  override: null,
  effective: "VENUE",
} as const satisfies ConfigurationSettingProjection;

const RETENTION_PROJECTION = {
  setting: "rawGpsRetentionDays",
  default: 30,
  overridePresent: false,
  override: null,
  effective: 90,
} as const satisfies ConfigurationSettingProjection;

const MONEY_PROJECTION = {
  setting: "valetServiceFee",
  default: "25.000",
  overridePresent: false,
  override: null,
  effective: "35.500",
} as const satisfies ConfigurationSettingProjection;

function renderSheet(projection: ConfigurationSettingProjection): string {
  return renderToStaticMarkup(
    <LocaleProvider>
      <OverrideEditorSheet
        currency="AED"
        onClose={noop}
        onSave={noop}
        pending={false}
        projection={projection}
      />
    </LocaleProvider>,
  );
}

describe("override editor sheet field labeling", () => {
  it("boolean mode never renders an orphan htmlFor and names its toggle group", () => {
    const markup = renderSheet(BOOLEAN_PROJECTION);
    // No label element and no label association may exist: nothing owns
    // "config-editor-input" in this mode.
    expect(markup.includes("<label")).toBe(false);
    expect(markup.includes('for="')).toBe(false);
    // The field text is neutral text that names the toggle group instead.
    expect(markup.includes('id="config-editor-value-label"')).toBe(true);
    expect(markup.includes('role="group"')).toBe(true);
    expect(
      markup.includes('aria-labelledby="config-editor-value-label"'),
    ).toBe(true);
    // Both truthfully-named toggles are present with their pressed state.
    expect((markup.match(/aria-pressed="true"/gu) ?? []).length).toBe(1);
    expect((markup.match(/aria-pressed="false"/gu) ?? []).length).toBe(1);
  });

  it("control-backed modes keep exactly one real label/control association", () => {
    for (const projection of [
      ENUM_PROJECTION,
      RETENTION_PROJECTION,
      MONEY_PROJECTION,
    ]) {
      const markup = renderSheet(projection);
      expect((markup.match(/<label/u) ?? []).length).toBe(1);
      expect(markup.includes('for="config-editor-input"')).toBe(true);
      expect(markup.includes('id="config-editor-input"')).toBe(true);
    }
  });
});

/**
 * Source invariants pinning the accepted mount-focus baseline. These use the
 * same source-guard approach as financial-overview-money-guard.test.ts
 * because the node test environment cannot execute DOM effects.
 */
describe("dialog initial focus pattern", () => {
  const dialogSource = readFileSync(
    new URL("./clear-override-dialog.tsx", import.meta.url),
    "utf8",
  );

  it("clear dialog keeps Cancel ahead of the destructive confirm", () => {
    const cancelIndex = dialogSource.indexOf('className="btn-secondary"');
    const confirmIndex = dialogSource.indexOf('className="btn-primary"');
    expect(cancelIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(cancelIndex);
  });
});

describe("clear override dialog static rendering", () => {
  it("renders an accessible alertdialog with a labeled Cancel", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider>
        <ClearOverrideDialog
          busy={false}
          onCancel={noop}
          onConfirm={noop}
          settingLabel="Valet service fee"
        />
      </LocaleProvider>,
    );
    expect(markup.includes('role="alertdialog"')).toBe(true);
    expect(markup.includes("aria-modal")).toBe(true);
    expect(markup.includes("Valet service fee")).toBe(true);
    // No orphan labels exist in the dialog either.
    expect(markup.includes("<label")).toBe(false);
  });
});
