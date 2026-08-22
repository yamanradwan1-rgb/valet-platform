import type { JSX } from "react";
import type { Screen } from "../../types/employee-ui";
import { Badge, VehicleIdentity } from "../ui/employee-primitives";

export function PrototypePriorityTaskCard({
  nav,
}: {
  readonly nav?: ((s: Screen) => void) | undefined;
}): JSX.Element {
  return (
    <div
      onClick={() => nav?.("retrieval")}
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
        <VehicleIdentity model="BMW X5" plate="12-34567" color="Black" />
        <p className="text-neutral text-[13px] mt-1.5">Requested 2 min ago</p>
        <div className="mt-4 pt-4 border-t border-vborder flex items-center justify-between">
          <div>
            <p className="text-[10px] text-neutral uppercase tracking-wider">
              Pickup
            </p>
            <p className="text-navy font-semibold text-sm mt-0.5">
              Main Entrance
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nav?.("retrieval");
            }}
            className="bg-vblue text-white text-sm font-bold px-5 h-10 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
          >
            Accept Task
          </button>
        </div>
      </div>
    </div>
  );
}

export const PROTOTYPE_QUEUE_ITEMS: {
  readonly info: string;
  readonly meta: string;
  readonly model: string;
  readonly plate: string;
  readonly screen: Screen;
  readonly type: "checkin" | "parking" | "handoff";
}[] = [
  {
    type: "checkin",
    model: "Toyota Camry",
    plate: "87-65432",
    info: "just now",
    meta: "Check-in",
    screen: "check-in",
  },
  {
    type: "parking",
    model: "Mercedes E-Class",
    plate: "45-88231",
    info: "5 min ago",
    meta: "Zone A",
    screen: "parking",
  },
  {
    type: "handoff",
    model: "Audi Q7",
    plate: "99-12345",
    info: "waiting",
    meta: "Main Entrance",
    screen: "retrieval",
  },
];
