import type { JSX } from "react";

import type { Tab } from "../../types/employee-ui";
import {
  CarIcon,
  HomeIcon,
  ScanIcon,
  ShiftIcon,
} from "../icons/employee-icons";
import { useEmployeeI18n } from "./employee-i18n";

export function BottomNav({
  active,
  onTab,
}: {
  active: Tab;
  onTab: (t: Tab) => void;
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
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={`flex-1 flex flex-col items-center gap-1 py-2 pb-3 cursor-pointer transition-colors ${
            active === id ? "text-vblue" : "text-neutral"
          }`}
        >
          {id === "scan" ? (
            <>
              <div className="bg-vblue rounded-[18px] p-3 -mt-5 shadow-lg shadow-vblue/30">
                <ScanIcon white />
              </div>
              <span className="text-[10px] font-semibold text-neutral mt-0.5">
                {label}
              </span>
            </>
          ) : (
            <>
              <Icon active={active === id} />
              <span
                className={`text-[10px] font-semibold ${
                  active === id ? "text-vblue" : "text-neutral"
                }`}
              >
                {label}
              </span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}
