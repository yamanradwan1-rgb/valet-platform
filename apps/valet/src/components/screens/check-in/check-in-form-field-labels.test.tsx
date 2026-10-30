import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { employeeDictionary } from "../../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../../shell/employee-i18n";
import { CheckInCustomerPhoneStep } from "./check-in-intake-steps";
import { CheckInManualPlateFields } from "./check-in-manual-plate-fields";

function manualPlateFields() {
  return (
    <CheckInManualPlateFields
      onChangePlateCountry={vi.fn()}
      onChangePlateNumber={vi.fn()}
      onContinue={vi.fn()}
      onNoPlate={vi.fn()}
      plateCountry="JO"
      plateNumber="12-34567"
    />
  );
}

function customerPhoneStep() {
  return (
    <CheckInCustomerPhoneStep
      phone="79 123 4567"
      onBack={vi.fn()}
      onChangePhone={vi.fn()}
      onContinue={vi.fn()}
      onNoPhone={vi.fn()}
    />
  );
}

function renderFields(locale: "en" | "ar"): string {
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={locale}>
      {manualPlateFields()}
      {customerPhoneStep()}
    </EmployeeI18nProvider>,
  );
}

function associatedControl(
  markup: string,
  visibleLabel: string,
  tag: "input" | "select",
): { id: string; markup: string } {
  const labels = [...markup.matchAll(/<label\b([^>]*)>([^<]*)<\/label>/g)];
  const matchingLabel = labels.find(
    (match) => match[2]?.trim() === visibleLabel,
  );
  expect(matchingLabel, `visible label: ${visibleLabel}`).toBeDefined();

  const id = /\bfor="([^"]+)"/.exec(matchingLabel?.[1] ?? "")?.[1];
  expect(id, `label association: ${visibleLabel}`).toBeTruthy();
  const controls = [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))]
    .map((match) => match[0])
    .filter((control) => control.includes(`id="${id}"`));
  expect(controls, `one control for: ${visibleLabel}`).toHaveLength(1);
  if (!id || !controls[0])
    throw new Error(`Missing control label: ${visibleLabel}`);
  return { id, markup: controls[0] };
}

describe("manual Check-In form field accessible names", () => {
  it.each(["en", "ar"] as const)(
    "associates all three visible %s labels with their native controls",
    (locale) => {
      const t = employeeDictionary(locale);
      const markup = renderFields(locale);
      const plate = associatedControl(markup, t.licensePlate, "input");
      const country = associatedControl(markup, t.countryRegion, "select");
      const phone = associatedControl(markup, t.mobileNumber, "input");

      expect(new Set([plate.id, country.id, phone.id]).size).toBe(3);
      expect(plate.markup).toContain('dir="ltr"');
      expect(plate.markup).toContain('value="12-34567"');
      expect(markup).toContain('<option value="JO" selected=""');
      expect(phone.markup).toContain('type="tel"');
      expect(phone.markup).toContain('dir="ltr"');
      expect(phone.markup).toContain('value="79 123 4567"');
    },
  );

  it("uses unique label targets for concurrent manual-field instances", () => {
    const t = employeeDictionary("en");
    const markup = renderToStaticMarkup(
      <EmployeeI18nProvider initialLocale="en">
        {manualPlateFields()}
        {manualPlateFields()}
      </EmployeeI18nProvider>,
    );
    const labels = [...markup.matchAll(/<label\b([^>]*)>([^<]*)<\/label>/g)];
    const ids = labels
      .filter((match) =>
        [t.licensePlate, t.countryRegion].includes(match[2]?.trim() ?? ""),
      )
      .map((match) => /\bfor="([^"]+)"/.exec(match[1] ?? "")?.[1]);

    expect(ids).toHaveLength(4);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(markup.match(new RegExp(`id="${id}"`, "g"))).toHaveLength(1);
    }
  });
});
