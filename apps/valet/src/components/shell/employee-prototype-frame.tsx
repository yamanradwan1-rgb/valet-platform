"use client";

import type { JSX } from "react";

import type { Screen, Tab } from "../../types/employee-ui";
import { CheckInFlow } from "../screens/check-in-flow";
import { IncidentFlow } from "../screens/incident-flow";
import { ParkingFlow } from "../screens/parking-flow";
import { RetrievalFlow } from "../screens/retrieval-flow";
import { ScanHubScreen } from "../screens/scan-hub-screen";
import { ShiftStartScreen } from "../screens/shift-start-screen";
import { ShiftSummaryScreen } from "../screens/shift-summary-screen";
import { TaskQueueScreen } from "../screens/task-queue-screen";
import { VehiclesListScreen } from "../screens/vehicles-list-screen";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";
import { OfflineBanner } from "../ui/employee-primitives";

export interface EmployeePrototypeFrameProps {
  readonly isOffline: boolean;
  readonly nav: (s: Screen) => void;
  readonly onToggleOffline: () => void;
  readonly screen: Screen;
}

function getActiveTab(s: Screen): Tab {
  if (s === "vehicles-list") return "vehicles";
  if (s === "scan-hub") return "scan";
  if (s === "shift-summary") return "shift";
  return "home";
}

export function EmployeePrototypeFrame({
  isOffline,
  nav,
  onToggleOffline,
  screen,
}: EmployeePrototypeFrameProps): JSX.Element {
  const renderScreen = (): JSX.Element | null => {
    switch (screen) {
      case "task-queue":
        return <TaskQueueScreen mode="prototype" nav={nav} />;
      case "check-in":
        return <CheckInFlow mode="prototype" nav={nav} />;
      case "parking":
        return <ParkingFlow mode="prototype" nav={nav} />;
      case "retrieval":
        return <RetrievalFlow nav={nav} />;
      case "incident":
        return <IncidentFlow nav={nav} />;
      case "vehicles-list":
        return <VehiclesListScreen />;
      case "scan-hub":
        return <ScanHubScreen nav={nav} />;
      case "shift-summary":
        return <ShiftSummaryScreen />;
      default:
        return null;
    }
  };

  if (screen === "shift-start") {
    return (
      <div className="min-h-screen bg-navy-2 flex items-center justify-center">
        <div className="w-full max-w-[390px] h-screen md:h-[844px] bg-navy overflow-hidden md:rounded-[44px] md:shadow-2xl flex flex-col">
          <ShiftStartScreen onStart={() => nav("task-queue")} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-3 flex items-start justify-center md:items-center">
      <div className="relative w-full max-w-[390px] h-screen md:h-[844px] bg-warm flex flex-col overflow-hidden md:rounded-[44px] md:shadow-2xl">
        {isOffline && <OfflineBanner />}
        <AppHeader mode="prototype" />

        <main className="flex-1 overflow-y-auto">{renderScreen()}</main>

        <BottomNav
          active={getActiveTab(screen)}
          onTab={(t) => {
            if (t === "home") nav("task-queue");
            if (t === "vehicles") nav("vehicles-list");
            if (t === "scan") nav("scan-hub");
            if (t === "shift") nav("shift-summary");
          }}
        />

        <button
          onClick={onToggleOffline}
          className="absolute top-[72px] right-3 text-[9px] text-muted font-bold uppercase tracking-wider opacity-30 hover:opacity-80 cursor-pointer transition-opacity px-2 py-1"
        >
          {isOffline ? "online" : "offline"}
        </button>
      </div>
    </div>
  );
}
