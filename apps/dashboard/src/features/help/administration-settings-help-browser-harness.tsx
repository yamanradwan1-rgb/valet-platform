import { createRoot } from "react-dom/client";
import { useState } from "react";

import { OperatingHoursEditor } from "../administration/settings/operating-hours-editor";
import { SettingRow } from "../administration/settings/setting-row";
import { SlaSettingRow } from "../administration/settings/sla-setting-row";
import { legacyLocationKeys, settingDefinitions } from "../administration/settings/setting-definitions";

declare global {
  interface Window {
    settingHelpMutations: { save: number; clear: number };
  }
}

window.settingHelpMutations = { save: 0, clear: 0 };
const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
const schedule = { days: days.map((weekday) => ({ weekday, status: "CLOSED" as const })) };

function FixtureRows({ context }: { readonly context: "company" | "override" | "manager" }) {
  const definitions = settingDefinitions.filter((definition) =>
    context !== "manager" || legacyLocationKeys.has(definition.key),
  );
  return (
    <section data-context={context}>
      <h2>{context}</h2>
      <table><tbody>
        {definitions.map((definition) => (
          <SettingRow
            canClear={context !== "company"}
            defaultValue={false}
            definition={definition}
            key={definition.key}
            locale="en"
            onClear={() => { window.settingHelpMutations.clear++; }}
            onSet={() => { window.settingHelpMutations.save++; }}
            overridePresent={context !== "company"}
            value={definition.kind === "boolean" ? false :
              definition.kind === "select" ? definition.options?.[0] ?? "" : 100}
          />
        ))}
        {context !== "manager" ? (
          <OperatingHoursEditor
            canClear
            locale="en"
            onClear={() => { window.settingHelpMutations.clear++; }}
            onSave={() => { window.settingHelpMutations.save++; }}
            value={schedule}
          />
        ) : null}
        {context === "override" ? (
          <SlaSettingRow
            locale="en"
            onClear={() => { window.settingHelpMutations.clear++; }}
            onSet={() => { window.settingHelpMutations.save++; }}
            value={120}
          />
        ) : null}
      </tbody></table>
    </section>
  );
}

function Harness() {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button data-test="unmount" onClick={() => setMounted(false)} type="button">Unmount</button>
      {mounted ? (
        <main>
          <FixtureRows context="company" />
          <FixtureRows context="override" />
          <FixtureRows context="manager" />
        </main>
      ) : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
