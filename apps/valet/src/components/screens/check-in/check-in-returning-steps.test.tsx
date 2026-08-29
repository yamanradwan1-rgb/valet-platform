import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeI18nProvider } from "../../shell/employee-i18n";
import { CheckInReturningVehicleStep } from "./check-in-returning-vehicle-step";
import { CheckInVehicleDetailFields } from "./check-in-vehicle-detail-fields";
import { CheckInVehicleDetailsStep } from "./check-in-vehicle-details-step";

const vehicle = {
  color: "Black",
  make: "BMW",
  model: "X5",
  plateCountry: "JO",
  plateNumberNormalized: "1254353",
  plateNumberRaw: "12-54353",
  returningCustomer: {
    customerId: "77777777-7777-4777-8777-777777777777",
    displayName: "Ahmad",
    phoneSuffix: "1234",
  },
  vehicleId: "44444444-4444-4444-8444-444444444444",
  vehicleUpdatedAt: "2026-08-29T10:00:00.000Z",
};

function returningMarkup(locale: "en" | "ar" = "en"): string {
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={locale}>
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <CheckInReturningVehicleStep
          correctionConflict={false}
          customerResolved={false}
          error={null}
          isSubmitting={false}
          onBack={vi.fn()}
          onContinue={vi.fn()}
          onDifferentCustomer={vi.fn()}
          onSaveCorrection={vi.fn()}
          onUseSavedCustomer={vi.fn()}
          vehicle={vehicle}
        />
      </div>
    </EmployeeI18nProvider>,
  );
}

describe("returning Check-In screens", () => {
  it("renders only authoritative vehicle and masked returning-customer data", () => {
    const markup = returningMarkup();
    expect(markup).toContain("Vehicle found");
    expect(markup).toContain("BMW X5");
    expect(markup).toContain('<bdi dir="ltr">12-54353</bdi>');
    expect(markup).toContain("Ahmad");
    expect(markup).toContain("Phone ending");
    expect(markup).toContain('<bdi dir="ltr">1234</bdi>');
    expect(markup).toContain("Use saved customer");
    expect(markup).toContain("Different customer");
    expect(markup).not.toContain("+962");
    expect(markup).not.toContain("owner");
  });

  it("renders the same hierarchy in Arabic with isolated identifiers", () => {
    const markup = returningMarkup("ar");
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("تم العثور على المركبة");
    expect(markup).toContain("عميل عائد");
    expect(markup).toContain("استخدام العميل المحفوظ");
    expect(markup).toContain('<bdi dir="ltr">12-54353</bdi>');
    expect(markup).toContain('<bdi dir="ltr">1234</bdi>');
  });

  it("keeps correction fields inline on the returning screen", () => {
    const markup = returningMarkup();
    expect(markup).toContain("Correct vehicle details");
    expect(markup).not.toContain("Vehicle correction");
  });

  it("renders one compact vehicle-details step and requires a no-plate description", () => {
    const markup = renderToStaticMarkup(
      <CheckInVehicleDetailsStep
        initialDetails={{ color: null, make: null, model: null }}
        isNoPlate
        onBack={vi.fn()}
        onContinue={vi.fn()}
        plate="No plate"
      />,
    );
    expect(markup).toContain("Vehicle details");
    expect(markup).toContain("Vehicle description");
    expect(markup).toContain("Silver Toyota SUV");
    expect(markup).toContain("Skip vehicle details");
    expect(markup).toContain("disabled");
  });

  it("filters model suggestions by selected make and keeps Other/Unknown", () => {
    const markup = renderToStaticMarkup(
      <CheckInVehicleDetailFields
        values={{ color: "", make: "Toyota", model: "" }}
        onChange={vi.fn()}
      />,
    );
    expect(markup).toContain('value="Land Cruiser"');
    expect(markup).not.toContain('value="X5"');
    expect(markup).toContain('value="Other"');
    expect(markup).toContain('value="Unknown"');
  });
});
