import Link from "next/link";

import {
  isNavigationPathActive,
  type DashboardNavigationItem,
} from "../../lib/navigation";

export function NavigationList({
  currentPath,
  items,
  label,
  onNavigate,
}: {
  readonly currentPath: string;
  readonly items: readonly DashboardNavigationItem[];
  readonly label: string;
  readonly onNavigate?: () => void;
}) {
  return (
    <nav aria-label={label}>
      <ul className="nav-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              aria-current={
                isNavigationPathActive(currentPath, item.href) ? "page" : undefined
              }
              className="nav-link"
              href={item.href}
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
            >
              <item.icon
                aria-hidden="true"
                className="nav-icon"
                size={19}
                strokeWidth={1.9}
              />
              <span className="nav-label">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
