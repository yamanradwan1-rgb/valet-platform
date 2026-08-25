import type { JSX } from "react";

import type { Tab } from "../../types/employee-ui";
import {
  CarIcon,
  HomeIcon,
  ScanIcon,
  ShiftIcon,
} from "../icons/employee-icons";
import { useEmployeeI18n } from "./employee-i18n";

/**
 * DEC-066 §1/§2: tabs may be individually disabled until their truthful Live
 * implementation exists (e.g. Vehicles/Scan in VUI-011A), and the whole bar
 * is pinned while an operational workflow is active so workflow-local
 * transient in-memory intent cannot be discarded by tab navigation.
 */
export function BottomNav({
  active,
  enabledTabs,
  onTab,
  pinned = false,
}: {
  active: Tab;
  enabledTabs?: Partial<Record<Tab, boolean>> | undefined;
  onTab: (t: Tab) => void;
  pinned?: boolean | undefined;
}): JSX.Element {
  const { t } = useEmployeeI18n();
  const tabs: {
    id: Tab;
    label: string;
    Icon: (p: { active?: boolean }) => JSX.Element | null;
  }[] = [
    { id: "home", label: t.tasksTitle, Icon: HomeIcon },
    { id: "vehicles", label: t.vehiclesNav, Icon: CarIcon },
    { id: "scan", label: t.scanNav, Icon: ScanIcon },
    { id: "shift", label: t.shiftNav, Icon: ShiftIcon },
  ];
  return (
    <nav className="bg-white border-t border-vborder flex-shrink-0 flex items-end h-[72px] px-2">
      {tabs.map(({ id, label, Icon }) => {
        const enabled = !pinned && (enabledTabs?.[id] ?? true);
        return (
          <button
            key={id}
            onClick={() => {
              if (enabled) onTab(id);
            }}
            disabled={!enabled}
            className={`flex-1 flex flex-col items-center gap-1 py-2 pb-3 transition-colors ${
              enabled ? "cursor-pointer" : "cursor-not-allowed"
            } ${active === id && enabled ? "text-vblue" : "text-neutral"} ${
              enabled ? "" : "opacity-40"
            }`}
          >
            {id === "scan" ? (
              <>
                <div
                  className={`rounded-[18px] p-3 -mt-5 ${
                    enabled
                      ? "bg-vblue shadow-lg shadow-vblue/30"
                      : "bg-neutral"
                  }`}
                >
                  <ScanIcon white />
                </div>
                <span className="text-[10px] font-semibold text-neutral mt-0.5">
                  {label}
                </span>
              </>
            ) : (
              <>
                <Icon active={active === id && enabled} />
                <span
                  className={`text-[10px] font-semibold ${
                    active === id && enabled ? "text-vblue" : "text-neutral"
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
