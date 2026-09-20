import Link from "next/link";

import type { DashboardNavigationItem } from "../../lib/navigation";

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
              aria-current={currentPath === item.href ? "page" : undefined}
              className="nav-link"
              href={item.href}
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
