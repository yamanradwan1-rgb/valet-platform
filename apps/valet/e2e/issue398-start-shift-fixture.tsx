import { useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import type { StaffOperationalLocation } from "@valet/contracts";

import { StartShiftGatePanel } from "../src/components/shell/employee-start-shift-panel";
import { EmployeeI18nProvider } from "../src/components/shell/employee-i18n";
import type { StartShiftPhase } from "../src/features/shift";

const locations = {
  A: {
    code: "LOC-A",
    currency: "JOD",
    locationId: "11111111-1111-4111-8111-111111111111",
    name: "A Hotel",
    timezone: "Asia/Amman",
  },
  B: {
    code: "LOC-B",
    currency: "JOD",
    locationId: "22222222-2222-4222-8222-222222222222",
    name: "B Hotel",
    timezone: "Asia/Amman",
  },
  C: {
    code: "LOC-C",
    currency: "JOD",
    locationId: "33333333-3333-4333-8333-333333333333",
    name: "C Hotel",
    timezone: "Asia/Amman",
  },
} as const satisfies Record<string, StaffOperationalLocation>;

type LocationKey = keyof typeof locations;

const harness = {
  submitted: [] as string[],
  retries: 0,
  setEligible: (_keys: LocationKey[]) => {},
  setUncertain: (_location: LocationKey) => {},
};

Object.assign(window, { __issue398: harness });

function Fixture(): JSX.Element {
  const [eligible, setEligible] = useState<StaffOperationalLocation[]>([
    locations.A,
    locations.B,
  ]);
  const [phase, setPhase] = useState<StartShiftPhase>({ kind: "idle" });
  harness.setEligible = (keys) =>
    setEligible(keys.map((key) => locations[key]));
  harness.setUncertain = (key) =>
    setPhase({
      kind: "uncertain",
      targetLocationId: locations[key].locationId,
    });
  const locale =
    new URLSearchParams(window.location.search).get("locale") === "ar"
      ? "ar"
      : "en";

  return (
    <EmployeeI18nProvider initialLocale={locale}>
      <StartShiftGatePanel
        locations={eligible}
        onRetryStart={() => {
          harness.retries += 1;
        }}
        onStartShift={(locationId) => {
          harness.submitted.push(locationId);
        }}
        phase={phase}
      />
    </EmployeeI18nProvider>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Fixture />);
