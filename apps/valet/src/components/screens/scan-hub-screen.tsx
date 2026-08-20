import type { JSX } from "react";

import type { Screen } from "../../types/employee-ui";
import { CameraSquareIcon } from "../icons/employee-icons";

export function ScanHubScreen({
  nav,
}: {
  nav: (s: Screen) => void;
}): JSX.Element {
  const options = [
    {
      label: "License Plate",
      sub: "Check-in new vehicle",
      color: "bg-vblue",
      screen: "check-in" as Screen,
    },
    {
      label: "Key QR",
      sub: "Assign or verify a key",
      color: "bg-navy-3",
      screen: "check-in" as Screen,
    },
    {
      label: "Parking Spot",
      sub: "Confirm parking location",
      color: "bg-vwarning",
      screen: "parking" as Screen,
    },
    {
      label: "Pickup QR",
      sub: "Verify guest at handoff",
      color: "bg-vsuccess",
      screen: "retrieval" as Screen,
    },
  ];
  return (
    <div className="p-5">
      <h1 className="font-bold text-xl text-navy mb-2">Scan</h1>
      <p className="text-neutral text-sm mb-6">Select what to scan</p>
      <div className="grid grid-cols-2 gap-4">
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => nav(opt.screen)}
            className="bg-white rounded-2xl border border-vborder p-5 text-left flex flex-col gap-4 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.97]"
          >
            <div
              className={`w-12 h-12 rounded-xl ${opt.color} flex items-center justify-center text-white`}
            >
              <CameraSquareIcon />
            </div>
            <div>
              <p className="font-semibold text-navy text-sm leading-tight">
                {opt.label}
              </p>
              <p className="text-muted text-xs mt-0.5">{opt.sub}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
