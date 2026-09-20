import type { DashboardNavigationItem } from "../../lib/navigation";
import { NavigationList } from "./navigation-list";

export function DashboardSidebar({
  currentPath,
  items,
  navigationLabel,
}: {
  readonly currentPath: string;
  readonly items: readonly DashboardNavigationItem[];
  readonly navigationLabel: string;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">
          <span aria-hidden="true" className="brand-dot" />
          VAYLET
        </span>
      </div>
      <NavigationList
        currentPath={currentPath}
        items={items}
        label={navigationLabel}
      />
    </aside>
  );
}
