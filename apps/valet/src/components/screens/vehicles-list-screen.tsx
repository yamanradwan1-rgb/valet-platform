import { useState, type JSX } from "react";

import type { BadgeVariant } from "../../types/employee-ui";
import { SearchIcon } from "../icons/employee-icons";
import { Badge } from "../ui/employee-primitives";

export function VehiclesListScreen(): JSX.Element {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  const vehicles = [
    {
      model: "BMW X5",
      plate: "12-34567",
      status: "parked" as BadgeVariant,
      key: "B-214",
      zone: "Zone B · B-17",
    },
    {
      model: "Mercedes E-Class",
      plate: "45-88231",
      status: "parking" as BadgeVariant,
      key: "C-091",
      zone: "In transit",
    },
    {
      model: "Audi Q7",
      plate: "99-12345",
      status: "requested" as BadgeVariant,
      key: "A-307",
      zone: "Zone A · A-03",
    },
    {
      model: "Toyota Camry",
      plate: "87-65432",
      status: "checkin" as BadgeVariant,
      key: "—",
      zone: "—",
    },
    {
      model: "Range Rover Sport",
      plate: "55-11203",
      status: "ready" as BadgeVariant,
      key: "D-019",
      zone: "Main Entrance",
    },
  ];

  const filters = ["All", "Active", "Parked", "Requested", "Ready"];

  return (
    <div>
      <div className="px-5 py-4 bg-warm border-b border-vborder space-y-3">
        <h1 className="font-bold text-xl text-navy">Vehicles</h1>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search plate or vehicle..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-11 bg-white border border-vborder rounded-xl pl-10 pr-4 text-sm text-navy focus:outline-none focus:border-vblue transition-colors"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-4 h-8 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                filter === f
                  ? "bg-navy text-white"
                  : "bg-white border border-vborder text-neutral hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {vehicles.map((v, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-vborder p-4 cursor-pointer hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-heading font-bold text-navy text-[15px] leading-tight">
                  {v.model}
                </p>
                <p className="text-neutral text-xs mt-0.5">{v.plate}</p>
              </div>
              <Badge variant={v.status} />
            </div>
            <div className="flex items-center gap-5 pt-3 border-t border-vborder">
              <div>
                <p className="text-muted text-[10px] uppercase tracking-wider">
                  Key
                </p>
                <p className="text-navy font-semibold text-sm mt-0.5">
                  {v.key}
                </p>
              </div>
              <div>
                <p className="text-muted text-[10px] uppercase tracking-wider">
                  Location
                </p>
                <p className="text-navy font-semibold text-sm mt-0.5">
                  {v.zone}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
