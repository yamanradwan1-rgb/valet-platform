"use client";

import { useState, type JSX } from "react";

import type { Screen, Tab } from "../types/employee-ui";
import { CheckInFlow } from "./screens/check-in-flow";
import { IncidentFlow } from "./screens/incident-flow";
import { ParkingFlow } from "./screens/parking-flow";
import { RetrievalFlow } from "./screens/retrieval-flow";
import { ScanHubScreen } from "./screens/scan-hub-screen";
import { ShiftStartScreen } from "./screens/shift-start-screen";
import { ShiftSummaryScreen } from "./screens/shift-summary-screen";
import { TaskQueueScreen } from "./screens/task-queue-screen";
import { VehiclesListScreen } from "./screens/vehicles-list-screen";
import { AppHeader } from "./shell/app-header";
import { BottomNav } from "./shell/bottom-nav";
import { OfflineBanner } from "./ui/employee-primitives";
import { useStaffOperationalContext } from "../features/staff-operational-context";

function getActiveTab(s: Screen): Tab {
  if (s === "vehicles-list") return "vehicles";
  if (s === "scan-hub") return "scan";
  if (s === "shift-summary") return "shift";
  return "home";
}

export function EmployeeApp(): JSX.Element {
  const { resolution, refresh: refreshContext } = useStaffOperationalContext();
  const [screenOverride, setScreenOverride] = useState<Screen | null>(null);
  const [isPrototypeOffline, setIsPrototypeOffline] = useState(false);

  const isLive = resolution.kind === "RESOLVED";
  const initialScreen: Screen = isLive ? "task-queue" : "shift-start";
  const screen: Screen = screenOverride ?? initialScreen;
  const nav = (s: Screen) => setScreenOverride(s);

  const activeScope = isLive ? resolution.scope : null;

  const renderScreen = () => {
    switch (screen) {
      case "task-queue":
        return (
          <TaskQueueScreen
            mode={isLive ? "live" : "prototype"}
            nav={nav}
            locationId={activeScope?.locationId}
            locationName={activeScope?.locationName}
            shiftStartedAt={activeScope?.shiftStartedAt}
            membershipId={activeScope?.membershipId}
            onAuthorizationLoss={refreshContext}
          />
        );
      case "check-in":
        return <CheckInFlow nav={nav} />;
      case "parking":
        return <ParkingFlow nav={nav} />;
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

  // Shift start — full-screen dark shell
  if (screen === "shift-start") {
    return (
      <div className="min-h-screen bg-navy-2 flex items-center justify-center">
        <div className="w-full max-w-[390px] h-screen md:h-[844px] bg-navy overflow-hidden md:rounded-[44px] md:shadow-2xl flex flex-col">
          <ShiftStartScreen
            onStart={() => {
              if (isLive) {
                nav("task-queue");
              }
            }}
          />
        </div>
      </div>
    );
  }

  // Main operational UI
  return (
    <div className="min-h-screen bg-navy-3 flex items-start justify-center md:items-center">
      <div className="relative w-full max-w-[390px] h-screen md:h-[844px] bg-warm flex flex-col overflow-hidden md:rounded-[44px] md:shadow-2xl">
        {/* OfflineBanner is strictly for prototype demonstration, NEVER rendered in live operational mode */}
        {!isLive && isPrototypeOffline && <OfflineBanner />}
        <AppHeader
          mode={isLive ? "live" : "prototype"}
          locationName={activeScope?.locationName}
          locationCode={activeScope?.locationCode}
          role={activeScope?.role}
        />

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

        {/* Demo utility: offline toggle strictly in prototype mode */}
        {!isLive && (
          <button
            onClick={() => setIsPrototypeOffline((o) => !o)}
            className="absolute top-[72px] right-3 text-[9px] text-muted font-bold uppercase tracking-wider opacity-30 hover:opacity-80 cursor-pointer transition-opacity px-2 py-1"
          >
            {isPrototypeOffline ? "online" : "offline"}
          </button>
        )}
      </div>
    </div>
  );
}
