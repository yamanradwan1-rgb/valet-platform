import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ShiftSummaryLive } from "./shift-summary-live";
import { isCashEntryValid } from "./cash-entry";
import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type { EndShiftPhase } from "../../features/shift";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../shell/employee-i18n";

vi.mock("../../lib/connectivity/use-online-status", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

const { useOnlineStatus } = await import(
  "../../lib/connectivity/use-online-status"
);

const SCOPE: ResolvedOperationalScope = {
  activeContext: {} as ResolvedOperationalScope["activeContext"],
  currency: "JOD",
  locationCode: "AMM-01",
  locationId: "22222222-2222-4222-8222-222222222222",
  locationName: "Amman Ridge Hotel",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  organizationName: "VAYLET Operations",
  role: "VALET_EMPLOYEE",
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-08-25T10:00:00.000Z",
};

function stubControls(phase: EndShiftPhase) {
  const endShift = vi.fn();
  const retryUncertainEndShift = vi.fn();
  return { endShift, phase, retryUncertainEndShift };
}

function renderWith(
  options: {
    locale?: "ar" | "en";
    online?: boolean;
    phase?: EndShiftPhase;
    scopeOverrides?: Partial<ResolvedOperationalScope>;
  } = {},
): string {
  const controls = stubControls(options.phase ?? { kind: "idle" });
  vi.mocked(useOnlineStatus).mockReturnValue(options.online ?? true);
  const screen = (
    <ShiftSummaryLive
      endShift={controls.endShift}
      endShiftPhase={controls.phase}
      retryUncertainEndShift={controls.retryUncertainEndShift}
      scope={{ ...SCOPE, ...options.scopeOverrides }}
    />
  );
  if (options.locale === undefined) return renderToStaticMarkup(screen);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {screen}
    </EmployeeI18nProvider>,
  );
}

describe("DEC-066 §3 Live Shift screen", () => {
  it("renders only authoritative operational facts with no identity or stats", () => {
    const markup = renderWith();
    expect(markup).toContain("VAYLET Operations");
    expect(markup).toContain("Amman Ridge Hotel");
    expect(markup).toContain('<bdi dir="ltr">AMM-01</bdi>');
    expect(markup).toContain("Valet Employee");
    expect(markup).toContain("Active shift");
    // Raw Shift UUID is never exposed to the employee.
    expect(markup).not.toContain(SCOPE.shiftId);
    expect(markup).not.toContain(SCOPE.membershipId);
    // No fake identity and no prototype counters.
    expect(markup).not.toContain("Mohammed Khalil");
    expect(markup).not.toContain("Check-ins");
    expect(markup).not.toContain("Parking tasks");
    expect(markup).not.toContain("Retrievals");
    expect(markup).not.toContain("Handoffs");
    expect(markup).not.toContain("Incidents");
  });

  it("shows the Active badge, never Parking, while the shift is active", () => {
    const markup = renderWith();
    expect(markup).toContain(">Active<");
    expect(markup).not.toContain(">PARKING<");
  });

  it("supports Arabic rendering of all live labels", () => {
    const ar = employeeDictionary("ar");
    const markup = renderWith({ locale: "ar" });
    expect(markup).toContain(ar.organizationLabel);
    expect(markup).toContain(ar.roleLabel);
    expect(markup).toContain(ar.roleValetEmployee);
    expect(markup).toContain(ar.activeShiftLabel);
    expect(markup).toContain(ar.startedAtLabel);
    expect(markup).toContain(ar.endShiftAction);
    expect(markup).toContain(ar.cashReportedLabel);
    expect(markup).toContain(ar.cashAmountPlaceholder);
    expect(markup).toContain(ar.cashReportedHelper);
    expect(markup).not.toContain(ar.parkingState);
  });

  it("never shows raw ISO timestamps for the shift start time", () => {
    const markup = renderWith();
    expect(markup).not.toContain(SCOPE.shiftStartedAt);
    expect(markup).not.toContain("T10:00:00");
    // Authoritative ISO stays internal; a locale-formatted value renders.
    expect(markup).toMatch(/2026/);
  });

  it("renders the authoritative Location currency next to the cash input", () => {
    const markup = renderWith();
    expect(markup).toContain('<bdi dir="ltr">JOD</bdi>');
    // No hardcoded currency: a different authoritative value renders as-is.
    const other = renderWith({ scopeOverrides: { currency: "KWD" } });
    expect(other).toContain('<bdi dir="ltr">KWD</bdi>');
    expect(other).not.toContain(">JOD<");
  });

  it("uses truthful copy instead of a fake numeric placeholder", () => {
    const markup = renderWith();
    expect(markup).toContain("Enter cash amount");
    expect(markup).toContain(
      "Cash physically held at the end of this shift.",
    );
    expect(markup).not.toContain('placeholder="0.000"');
  });

  it("never prefills the cash entry, so only an explicitly typed amount submits", () => {
    const markup = renderWith();
    // Empty entry is invalid: the End Shift action stays disabled...
    expect(markup).toContain('value=""');
    const endIdx = markup.indexOf(">End Shift</button>");
    const endTag = markup.slice(markup.lastIndexOf("<button", endIdx), endIdx);
    expect(endTag).toContain('disabled=""');
    // ...while the money contract itself accepts a deliberately typed zero.
    expect(isCashEntryValid("0")).toBe(true);
    expect(isCashEntryValid("0.000")).toBe(true);
    expect(isCashEntryValid("")).toBe(false);
  });

  it("keeps the Location code LTR-isolated on its own non-breaking line", () => {
    const markup = renderWith();
    const codeIdx = markup.indexOf('<bdi dir="ltr">AMM-01</bdi>');
    expect(codeIdx).toBeGreaterThan(-1);
    // Code sits inside a block-level span so it never splits mid-identifier.
    const wrapper = markup.slice(markup.lastIndexOf("<span", codeIdx));
    expect(wrapper).toMatch(/^<span class="block/);
  });

  it("blocks the mutation truthfully while offline", () => {
    const markup = renderWith({ online: false });
    expect(markup).toContain(
      "No network connection. Reconnect to refresh and continue.",
    );
    const endIdx = markup.indexOf(">End Shift</button>");
    const endTag = markup.slice(
      markup.lastIndexOf("<button", endIdx),
      endIdx,
    );
    expect(endTag).toContain('disabled=""');
  });

  it("presents OPEN_TASK_HANDOFF_REQUIRED truthfully instead of a generic failure", () => {
    const markup = renderWith({
      phase: {
        code: "OPEN_TASK_HANDOFF_REQUIRED",
        kind: "error",
        message: "Open work must be handed over first.",
        openWorkBlocked: true,
      },
    });
    expect(markup).toContain(
      "Open work must be handed over before the shift can end.",
    );
    expect(markup).not.toContain("The operation failed.");
  });

  it("shows the uncertain outcome state without any success claim and offers explicit same-command retry", () => {
    const controls = stubControls({
      cashReported: "12.500",
      kind: "uncertain",
      shiftId: SCOPE.shiftId,
    });
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    const markup = renderToStaticMarkup(
      <ShiftSummaryLive
        endShift={controls.endShift}
        endShiftPhase={controls.phase}
        retryUncertainEndShift={controls.retryUncertainEndShift}
        scope={SCOPE}
      />,
    );
    expect(markup).toContain("may or may not have ended");
    expect(markup).not.toContain("Shift ended");
    const retryIdx = markup.indexOf(">Retry end shift</button>");
    expect(retryIdx).toBeGreaterThan(-1);
    expect(controls.retryUncertainEndShift).not.toHaveBeenCalled();
  });

  it("renders the authoritative cash reconciliation after confirmed success", () => {
    const markup = renderWith({
      phase: {
        kind: "ended",
        result: {
          cashReconciliation: {
            cashExpected: "120.000",
            cashReported: "118.500",
            cashVariance: "-1.500",
            currency: "JOD",
            reportedAt: "2026-08-25T18:00:00.000Z",
          },
          endedAt: "2026-08-25T18:00:00.000Z",
          locationId: SCOPE.locationId,
          shiftId: SCOPE.shiftId,
          startedAt: SCOPE.shiftStartedAt,
          status: "ENDED",
        },
      },
    });
    expect(markup).toContain("Shift ended");
    expect(markup).toContain("Cash expected");
    expect(markup).toContain('<bdi dir="ltr">120.000</bdi>');
    expect(markup).toContain('<bdi dir="ltr">-1.500 JOD</bdi>');
    // The raw Shift UUID still never appears.
    expect(markup).not.toContain(SCOPE.shiftId);
  });
});
