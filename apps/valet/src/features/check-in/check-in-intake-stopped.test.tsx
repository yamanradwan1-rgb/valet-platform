import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EmployeeApiError } from "@valet/employee-client";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { presentLiveError } from "../../lib/i18n/live-presentation";
import { EmployeeI18nProvider } from "../../components/shell/employee-i18n";
import { CheckInCustomerPhoneStep } from "../../components/screens/check-in/check-in-intake-steps";

const approved = {
  en: "This location is not accepting new vehicles right now. Contact the location manager.",
  ar: "هذا الفرع لا يستقبل سيارات جديدة حاليًا. تواصل مع إدارة الفرع.",
};
const vehicle = {
  make: "Toyota",
  model: "Camry",
  color: "Silver",
  plateCountry: "JO",
  plateNumberRaw: "12-34567",
  temporaryDescriptor: null,
};

it.each([false, true])(
  "preserves typed rejection and form workflow; recognized=%s",
  async (known) => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        vehicle: known
          ? {
              ...vehicle,
              vehicleId: "33333333-3333-4333-8333-333333333333",
              vehicleUpdatedAt: "2026-10-26T00:00:00.000Z",
              plateNumberNormalized: "1234567",
              returningCustomer: null,
            }
          : null,
      })
      .mockRejectedValueOnce(
        new EmployeeApiError({
          code: "LOCATION_INTAKE_STOPPED",
          message: "Deliberately different server copy",
          status: 409,
        }),
      );
    const controller = new CheckInController(
      { request } as unknown as EmployeeApiClient,
      () => {},
    );
    await controller.confirmPlate(
      "11111111-1111-4111-8111-111111111111",
      vehicle,
    );
    if (known) controller.continueToCustomer("returning-vehicle");
    else controller.setVehicleDetails(vehicle);
    const before = controller.getState();
    const phone = "79 000 0000";
    await controller.submitCustomerPhone(
      "11111111-1111-4111-8111-111111111111",
      phone,
    );
    expect(controller.getState()).toMatchObject({
      ...before,
      error: "Deliberately different server copy",
      errorCode: "LOCATION_INTAKE_STOPPED",
      isSubmitting: false,
      activeSession: null,
      step: "customer-phone",
    });
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2); // Recognition plus exactly one intake; no hydration or retry.
    const firstBody = request.mock.calls[1]?.[1].body;
    expect(firstBody.customer.phone).toBe("+962790000000");
    request.mockRejectedValueOnce(new Error("Unrelated failure"));
    await controller.submitCustomerPhone(
      "11111111-1111-4111-8111-111111111111",
      phone,
    );
    expect(request.mock.calls[2]?.[1].body.intakeOperationId).toBe(
      firstBody.intakeOperationId,
    );
    expect(controller.getState()).toMatchObject({
      error: "Unrelated failure",
      errorCode: null,
    });
    controller.setStep("plate-confirm");
    expect(controller.getState()).toMatchObject({
      error: null,
      errorCode: null,
    });
  },
);

it.each(["en", "ar"] as const)(
  "renders exact %s copy once in the established error style beside Continue",
  (locale) => {
    const t = employeeDictionary(locale);
    const message = presentLiveError(
      new Error("Untrusted server wording"),
      locale,
      t,
      "LOCATION_INTAKE_STOPPED",
    );
    expect(message).toBe(approved[locale]);
    const render = (code: string | null) =>
      renderToStaticMarkup(
        <EmployeeI18nProvider initialLocale={locale}>
          <CheckInCustomerPhoneStep
            phone="79 000 0000"
            error={message}
            errorCode={code}
            make="Toyota"
            model="Camry"
            plate="12-34567"
            onBack={() => {}}
            onChangePhone={() => {}}
            onContinue={() => {}}
            onNoPhone={() => {}}
          />
        </EmployeeI18nProvider>,
      );
    const stopped = render("LOCATION_INTAKE_STOPPED");
    expect(stopped.split(message)).toHaveLength(2);
    expect(stopped).toContain(
      'class="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs" role="alert"',
    );
    expect(stopped.indexOf('type="tel"')).toBeLessThan(
      stopped.indexOf(message),
    );
    expect(stopped.indexOf(message)).toBeLessThan(
      stopped.indexOf(t.continueLabel),
    );
    expect(stopped).toContain('value="79 000 0000"');
    expect(stopped).toContain('dir="ltr"');
    const generic = render(null);
    expect(generic.indexOf(message)).toBeLessThan(
      generic.indexOf('type="tel"'),
    );
    expect(generic).not.toContain('role="alert"');
    const other = new Error("Other existing error");
    expect(presentLiveError(other, locale, t)).toBe(
      locale === "ar" ? t.operationFailed : other.message,
    );
    expect(presentLiveError(other, locale, t, "KEY_CUSTODY_NOT_READY")).toBe(
      t.keySlotUnavailableRetry,
    );
    // Raw message text alone must never activate the code-aware mapping.
    expect(
      presentLiveError(new Error(approved.en), "ar", employeeDictionary("ar")),
    ).toBe(employeeDictionary("ar").operationFailed);
  },
);
