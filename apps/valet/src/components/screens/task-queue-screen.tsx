import { useState, type JSX } from "react";

import type { BadgeVariant, Screen } from "../../types/employee-ui";
import { ChevronRight, PlusIcon } from "../icons/employee-icons";
import { Badge, VehicleIdentity } from "../ui/employee-primitives";

export function TaskQueueScreen({
  nav,
}: {
  nav: (s: Screen) => void;
}): JSX.Element {
  const [primaryAccepted, setPrimaryAccepted] = useState(false);

  return (
    <div>
      <div className="bg-navy-3 px-5 py-2.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-vsuccess animate-pulse" />
        <span className="text-white text-xs font-semibold">Shift active</span>
        <span className="text-muted text-xs">
          · 6:00 PM – now · Four Seasons Amman
        </span>
      </div>

      <div className="px-5 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-navy font-bold text-2xl">Tasks</h1>
          <button
            onClick={() => nav("check-in")}
            className="bg-vblue text-white text-sm font-bold px-4 h-9 rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-[0.98] transition-all shadow-sm"
          >
            <PlusIcon />
            New Vehicle
          </button>
        </div>

        {/* Priority task */}
        <div
          onClick={() => nav("retrieval")}
          className="bg-white rounded-2xl border border-vborder overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="h-1 bg-vblue" />
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <Badge variant="retrieval" />
              <div className="text-right">
                <p className="text-[10px] text-neutral font-semibold uppercase tracking-wider">
                  SLA
                </p>
                <span className="font-heading tabular-nums text-xl font-bold text-vdanger">
                  02:14
                </span>
              </div>
            </div>
            <VehicleIdentity color="Black" />
            <p className="text-neutral text-[13px] mt-1.5">
              Requested 2 min ago
            </p>
            <div className="mt-4 pt-4 border-t border-vborder flex items-center justify-between">
              <div>
                <p className="text-[10px] text-neutral uppercase tracking-wider">
                  Pickup
                </p>
                <p className="text-navy font-semibold text-sm mt-0.5">
                  Main Entrance
                </p>
              </div>
              {!primaryAccepted ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPrimaryAccepted(true);
                  }}
                  className="bg-vblue text-white text-sm font-bold px-5 h-10 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                >
                  Accept Task
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    nav("retrieval");
                  }}
                  className="bg-vsuccess text-white text-sm font-bold px-4 h-10 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
                >
                  Start Retrieval
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Queue */}
        <div>
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-3">
            Queue
          </p>
          <div className="space-y-2">
            {[
              {
                type: "checkin" as BadgeVariant,
                model: "Toyota Camry",
                plate: "87-65432",
                info: "just now",
                meta: "Check-in",
              },
              {
                type: "parking" as BadgeVariant,
                model: "Mercedes E-Class",
                plate: "45-88231",
                info: "5 min ago",
                meta: "Zone A",
              },
              {
                type: "handoff" as BadgeVariant,
                model: "Audi Q7",
                plate: "99-12345",
                info: "waiting",
                meta: "Main Entrance",
              },
            ].map((task, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-vborder px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={task.type} />
                    <span className="text-muted text-xs">{task.info}</span>
                  </div>
                  <p className="font-heading font-bold text-navy text-[15px] leading-tight">
                    {task.model}
                  </p>
                  <p className="text-neutral text-xs mt-0.5">
                    {task.plate} · {task.meta}
                  </p>
                </div>
                <ChevronRight />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
