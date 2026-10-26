import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EmployeeI18nProvider } from "../../shell/employee-i18n";
import { employeeDictionary } from "../../../lib/i18n/dictionary";

const state = vi.hoisted(() => ({
  step: "customer-phone",
  error: "Safe server wording",
  errorCode: "LOCATION_INTAKE_STOPPED",
  pendingVehicle: {
    make: "Toyota",
    model: "Camry",
    color: "Silver",
    plateNumberRaw: "12-34567",
  },
}));
vi.mock("../../../features/check-in", () => ({ useCheckIn: () => state }));
const { CheckInFlow } = await import("../check-in-flow");

it.each(["en", "ar"] as const)(
  "preserves the code through CheckInFlow in %s",
  (locale) => {
    const html = renderToStaticMarkup(
      <EmployeeI18nProvider initialLocale={locale}>
        <CheckInFlow nav={() => {}} />
      </EmployeeI18nProvider>,
    );
    expect(html).toContain(employeeDictionary(locale).locationIntakeStopped);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Safe server wording");
    expect(html).toContain("12-34567");
  },
);
