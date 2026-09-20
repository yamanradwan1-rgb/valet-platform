import type { DashboardNavigationItem } from "../../lib/navigation";
import { Button } from "../presentation/button";
import { FocusDialog } from "../presentation/focus-dialog";
import { NavigationList } from "./navigation-list";

export function MobileNavigationDialog({
  closeLabel,
  currentPath,
  items,
  navigationLabel,
  onClose,
}: {
  readonly closeLabel: string;
  readonly currentPath: string;
  readonly items: readonly DashboardNavigationItem[];
  readonly navigationLabel: string;
  readonly onClose: () => void;
}) {
  return (
    <FocusDialog label={navigationLabel} onClose={onClose}>
      <div className="stack">
        <div className="sidebar-brand">
          <span className="brand-mark">
            <span aria-hidden="true" className="brand-dot" />
            VAYLET
          </span>
          <Button
            aria-label={closeLabel}
            onClick={onClose}
            type="button"
            variant="quiet"
          >
            ×
          </Button>
        </div>
        <NavigationList
          currentPath={currentPath}
          items={items}
          label={navigationLabel}
          onNavigate={onClose}
        />
      </div>
    </FocusDialog>
  );
}
