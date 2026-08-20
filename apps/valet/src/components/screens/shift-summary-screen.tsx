import type { JSX } from "react";

import { Btn } from "../ui/employee-primitives";

export function ShiftSummaryScreen(): JSX.Element {
  const stats = [
    { label: "Check-ins", value: "34" },
    { label: "Parking tasks", value: "29" },
    { label: "Retrievals", value: "31" },
    { label: "Handoffs", value: "30" },
    { label: "Incidents", value: "1", warn: true },
  ];
  return (
    <div className="p-5 space-y-5">
      <div>
        <h1 className="font-bold text-2xl text-navy">Shift Summary</h1>
        <p className="text-neutral text-sm mt-1">Mohammed Khalil</p>
      </div>
      <div className="bg-white rounded-2xl border border-vborder p-5">
        <p className="text-muted text-xs uppercase tracking-wider mb-3">
          Session
        </p>
        <p className="font-heading font-bold text-navy text-xl">
          6:00 PM – Now
        </p>
        <p className="text-neutral text-sm mt-1">
          Four Seasons Amman · Main Entrance
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-vborder overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-muted text-xs uppercase tracking-wider">
            Completed
          </p>
        </div>
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between px-5 py-3.5 border-t border-vborder"
          >
            <span className="text-navy text-sm">{s.label}</span>
            <span
              className={`font-heading font-bold text-2xl ${
                s.warn ? "text-vdanger" : "text-navy"
              }`}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
      <Btn label="End Shift" variant="secondary" />
    </div>
  );
}
