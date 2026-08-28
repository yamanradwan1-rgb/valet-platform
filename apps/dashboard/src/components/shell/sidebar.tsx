"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "../../i18n/locale-provider";
import type { NavSection } from "./nav-config";
import { NAV_SECTIONS, type IconName } from "./nav-config";

interface DesktopSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function DesktopSidebar({ collapsed, onToggle }: DesktopSidebarProps) {
  const { t } = useTranslation();
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      data-testid="desktop-sidebar"
      className="dashboard-sidebar desktop-sidebar"
      aria-label={t("shell.managementNavigation")}
    >
      <SidebarBrand collapsed={collapsed} />
      <NavigationContent collapsed={collapsed} />
      <div className="sidebar-footer">
        <button
          type="button"
          onClick={onToggle}
          className="sidebar-collapse-button"
          aria-label={
            collapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")
          }
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{ transform: collapsed ? "scaleX(-1)" : undefined }}
          >
            <path
              d="M10 4L6 8L10 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="sidebar-brand">
      <img
        src="/brand/VAYLET_Logo_Dark_Background.png"
        alt="VAYLET"
        className={`sidebar-logo-full ${collapsed ? "is-desktop-hidden" : ""}`}
      />
      <span
        className={`sidebar-logo-mark ${collapsed ? "is-desktop-visible" : ""}`}
        aria-hidden="true"
      >
        V
      </span>
    </div>
  );
}

export function NavigationContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="sidebar-nav">
      {NAV_SECTIONS.map((section) => (
        <SidebarGroup
          key={section.labelKey}
          section={section}
          collapsed={collapsed}
          {...(onNavigate === undefined ? {} : { onNavigate })}
        />
      ))}
    </nav>
  );
}

interface SidebarGroupProps {
  section: NavSection;
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarGroup({ section, collapsed, onNavigate }: SidebarGroupProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <div className="sidebar-group">
      <p
        className={`sidebar-group-label ${collapsed ? "is-desktop-hidden" : ""}`}
      >
        {t(section.labelKey)}
      </p>
      {section.items.map((item) => {
        const active =
          pathname === item.path || pathname.startsWith(`${item.path}/`);
        return (
          <Link
            key={item.path}
            href={item.path}
            {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
            aria-current={active ? "page" : undefined}
            title={collapsed ? t(item.labelKey) : undefined}
            className={`sidebar-link ${active ? "is-active" : ""} ${
              collapsed ? "is-collapsed" : ""
            }`}
          >
            <NavIcon
              name={iconForPath(item.path)}
              size={18}
              color={active ? "#EDF4FF" : "#8C98AA"}
            />
            <span
              className={`sidebar-link-label ${collapsed ? "is-desktop-hidden" : ""}`}
            >
              {t(item.labelKey)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function iconForPath(path: string): IconName {
  switch (path) {
    case "/overview":
      return "grid";
    case "/live-operations":
    case "/maps-zones":
      return "map";
    case "/sessions":
      return "car";
    case "/retrieval-queue":
      return "clock";
    case "/tasks":
      return "list";
    case "/active-shifts":
      return "users";
    case "/keys":
      return "key";
    case "/incidents":
      return "alert";
    case "/financial":
      return "bank";
    case "/analytics":
      return "chart";
    case "/reports":
      return "file";
    case "/location-settings":
      return "settings";
    case "/branding":
      return "palette";
    case "/subscription":
      return "star";
    default:
      return "list";
  }
}

const ICON_PATHS: Record<IconName, string> = {
  grid: "M2 2h6v6H2zM10 2h6v6h-6zM2 10h6v6H2zM10 10h6v6h-6z",
  map: "M6.5 2.5L1.5 4.5V15.5L6.5 13.5L11.5 15.5L16.5 13.5V2.5L11.5 4.5L6.5 2.5ZM6.5 2.5V13.5M11.5 4.5V15.5",
  car: "M3.5 11L5.5 6.5H12.5L14.5 11M2 11H16M2 11V14H16V11M4 14H6M12 14H14",
  clock: "M9 15.5A6.5 6.5 0 1 0 9 2.5A6.5 6.5 0 0 0 9 15.5ZM9 5.5V9L11.5 11",
  list: "M6 5H15M6 9H15M6 13H15M3 5H3.01M3 9H3.01M3 13H3.01",
  users:
    "M7 9A3 3 0 1 0 7 3A3 3 0 0 0 7 9ZM1.5 15.5C1.5 12.74 4.01 10.5 7 10.5C9.99 10.5 12.5 12.74 12.5 15.5",
  key: "M6.5 11.5A3.5 3.5 0 1 0 6.5 4.5A3.5 3.5 0 0 0 6.5 11.5ZM9.5 10L15.5 15.5M13 13L14.5 14.5",
  alert: "M9 2L1.5 15.5H16.5L9 2ZM9 8V10.5M9 13H9.01",
  bank: "M2 7H16M9 2L16 7H2L9 2ZM4 7V14M7 7V14M11 7V14M14 7V14M2 14H16",
  chart: "M2 14L6 9L9 11L13 6L16 8M2 16H16",
  file: "M4 2H11L14 5V16H4V2ZM11 2V5H14M6 9H12M6 12H10",
  settings:
    "M9 11.5A2.5 2.5 0 1 0 9 6.5A2.5 2.5 0 0 0 9 11.5ZM9 1.5V3M9 15V16.5M1.5 9H3M15 9H16.5M3.4 3.4L4.46 4.46M13.54 13.54L14.6 14.6M3.4 14.6L4.46 13.54M13.54 4.46L14.6 3.4",
  palette:
    "M9 16A7 7 0 1 1 9 2A7 7 0 0 1 9 16ZM6 7H6.01M10 6H10.01M13 9H13.01M9 16C9 16 6.5 14 6.5 12C6.5 11.17 7.17 10.5 8 10.5H9.5C10.33 10.5 11 11.17 11 12C11 13 9 16 9 16Z",
  star: "M9 2L10.8 6.5L15.5 7.1L12.2 10.3L13.1 15L9 12.7L4.9 15L5.8 10.3L2.5 7.1L7.2 6.5L9 2Z",
  close: "M5 5L15 15M15 5L5 15",
};

export function NavIcon({
  name,
  size,
  color,
}: {
  name: IconName;
  size: number;
  color: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d={ICON_PATHS[name]}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
