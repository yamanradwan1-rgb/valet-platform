import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StartShiftGatePanel } from "./employee-start-shift-panel";
import type { StaffOperationalLocation } from "@valet/contracts";
import type { StartShiftPhase } from "../../features/shift";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "./employee-i18n";

vi.mock("../../lib/connectivity/use-online-status", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

const { useOnlineStatus } = await import(
  "../../lib/connectivity/use-online-status"
);

const AMM: StaffOperationalLocation = {
  code: "AMM-01",
  currency: "JOD",
  locationId: "11111111-1111-4111-8111-111111111111",
  name: "Amman Ridge Hotel",
  timezone: "Asia/Amman",
};
const DEMO: StaffOperationalLocation = {
  code: "DEM-01",
  currency: "JOD",
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Demo Venue With A Rather Long Location Name For Wrapping",
  timezone: "Asia/Amman",
};

function renderPanel(
  options: {
    locations?: StaffOperationalLocation[];
    online?: boolean;
    phase?: StartShiftPhase | null;
    locale?: "ar" | "en";
  } = {},
): string {
  vi.mocked(useOnlineStatus).mockReturnValue(options.online ?? true);
  const panel = (
    <StartShiftGatePanel
      locations={options.locations ?? []}
      onDismissIntent={vi.fn()}
      onRetryStart={vi.fn()}
      onStartShift={vi.fn()}
      phase={options.phase ?? null}
    />
  );
  if (options.locale === undefined) return renderToStaticMarkup(panel);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {panel}
    </EmployeeI18nProvider>,
  );
}

describe("VUI-011D Start Shift gate panel", () => {
  it("renders only authoritative Locations with LTR-isolated codes", () => {
    const markup = renderPanel({ locations: [AMM] });
    expect(markup).toContain("Amman Ridge Hotel");
    expect(markup).toContain('<bdi dir="ltr">AMM-01</bdi>');
    // The code is block-isolated so it never splits mid-identifier.
    const codeIdx = markup.indexOf('<bdi dir="ltr">AMM-01</bdi>');
    const wrapper = markup.slice(markup.lastIndexOf("<span", codeIdx));
    expect(wrapper).toMatch(/^<span class="block/);
    expect(markup).toContain(">Start Shift</button>");
  });

  it("preselects a single authoritative Location so the explicit press starts it", () => {
    const markup = renderPanel({ locations: [AMM] });
    const startIdx = markup.indexOf(">Start Shift</button>");
    const startTag = markup.slice(markup.lastIndexOf("<button", startIdx), startIdx);
    expect(startTag).not.toContain('disabled=""');
  });

  it("requires an explicit choice before starting among multiple Locations", () => {
    const markup = renderPanel({ locations: [AMM, DEMO] });
    expect(markup).toContain('<bdi dir="ltr">DEM-01</bdi>');
    const startIdx = markup.indexOf(">Start Shift</button>");
    const startTag = markup.slice(markup.lastIndexOf("<button", startIdx), startIdx);
    expect(startTag).toContain('disabled=""');
  });

  it("states truthfully when no startable Location is authorized", () => {
    const markup = renderPanel({ locations: [] });
    expect(markup).toContain(
      "No startable location is available for your account right now.",
    );
    expect(markup).not.toContain(">Start Shift</button>");
  });

  it("blocks the ONLINE_ONLY mutation while offline without any success claim", () => {
    const markup = renderPanel({
      locations: [AMM],
      online: false,
    });
    expect(markup).toContain(
      "No network connection. Reconnect to refresh and continue.",
    );
    const startIdx = markup.indexOf(">Start Shift</button>");
    const startTag = markup.slice(markup.lastIndexOf("<button", startIdx), startIdx);
    expect(startTag).toContain('disabled=""');
  });

  it("shows the submitting state instead of a fresh Start affordance", () => {
    const markup = renderPanel({
      locations: [AMM],
      phase: { kind: "submitting" },
    });
    expect(markup).toContain("Starting shift...");
    expect(markup).not.toContain(">Start Shift</button>");
  });

  it("never claims success for an ambiguous outcome and offers only same-command retry or dismiss", () => {
    const markup = renderPanel({
      locations: [AMM],
      phase: {
        kind: "uncertain",
        targetLocationId: AMM.locationId,
      },
    });
    expect(markup).toContain("Confirm your start shift result");
    expect(markup).toContain("may or may not have been started");
    expect(markup).toContain(">Retry start shift</button>");
    expect(markup).toContain(">Dismiss</button>");
    expect(markup).not.toContain(">Start Shift</button>");
    // The chooser is replaced while the outcome stays unresolved.
    expect(markup).not.toContain("Amman Ridge Hotel");
  });

  it("surfaces the known cross-location conflict instead of a generic failure", () => {
    const markup = renderPanel({
      locations: [AMM],
      phase: {
        code: "ACTIVE_SHIFT_CONFLICT",
        kind: "error",
        locationConflict: true,
        message: "conflict",
      },
    });
    expect(markup).toContain(
      "You already have an active shift at a different location.",
    );
  });

  it("renders the full Arabic copy with RTL-safe structure", () => {
    const ar = employeeDictionary("ar");
    const markup = renderPanel({
      locale: "ar",
      locations: [AMM],
    });
    expect(markup).toContain(ar.chooseLocationLabel);
    expect(markup).toContain(ar.startShiftAction);
    expect(markup).toContain('<bdi dir="ltr">AMM-01</bdi>');

    const uncertain = renderPanel({
      locale: "ar",
      locations: [AMM],
      phase: { kind: "uncertain", targetLocationId: AMM.locationId },
    });
    expect(uncertain).toContain(ar.startShiftUncertainTitle);
    expect(uncertain).toContain(ar.startShiftUncertain);
    expect(uncertain).toContain(ar.retryStartShift);
    expect(uncertain).toContain(ar.dismissAction);

    const offlineAr = renderPanel({
      locale: "ar",
      locations: [AMM],
      online: false,
    });
    expect(offlineAr).toContain(ar.noNetworkMessage);

    const emptyAr = renderPanel({ locale: "ar", locations: [] });
    expect(emptyAr).toContain(ar.noStartableLocationDetail);
  });
});
