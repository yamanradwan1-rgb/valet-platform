"use client";

import type { JSX, ReactNode } from "react";

import type { Screen } from "../../types/employee-ui";
import type { UseTaskQueueResult } from "../../features/task-queue/use-task-queue";
import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";
import { ConnectivityBanner } from "./connectivity-banner";
import { EmployeeRetrievalAlert } from "./employee-retrieval-alert";
import {
  getActiveTab,
  liveEnabledTabs,
  liveWorkflowScreens,
  topLevelScreenForTab,
} from "./employee-navigation";

export interface EmployeeActiveShellProps {
  readonly children: ReactNode;
  readonly effectiveScreen: Screen;
  readonly nav: (screen: Screen) => void;
  readonly onReconnect: () => void;
  readonly scope: ResolvedOperationalScope;
  readonly taskQueue: UseTaskQueueResult;
}

export function EmployeeActiveShell({
  children,
  effectiveScreen,
  nav,
  onReconnect,
  scope,
  taskQueue,
}: EmployeeActiveShellProps): JSX.Element {
  return (
    <div className="min-h-screen bg-navy-3 flex items-start justify-center md:items-center">
      <div className="relative w-full max-w-[390px] h-screen md:h-[844px] bg-warm flex flex-col overflow-hidden md:rounded-[44px] md:shadow-2xl">
        <ConnectivityBanner onReconnect={onReconnect} />
        <AppHeader
          locationCode={scope.locationCode}
          locationName={scope.locationName}
          mode="live"
          role={scope.role}
        />
        <EmployeeRetrievalAlert
          onOpenTaskQueue={() => nav("task-queue")}
          taskQueue={taskQueue}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <BottomNav
          active={getActiveTab(effectiveScreen)}
          enabledTabs={liveEnabledTabs}
          onTab={(tab) => {
            const target = topLevelScreenForTab(tab);
            if (target !== null) nav(target);
          }}
          pinned={liveWorkflowScreens.has(effectiveScreen)}
        />
      </div>
    </div>
  );
}
