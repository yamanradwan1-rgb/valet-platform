"use client";

import { useCallback, useRef, type RefObject } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { ModalPortal } from "../ui/modal-portal";
import { NavigationContent, NavIcon } from "./sidebar";
import { useNavigationDrawerA11y } from "./use-navigation-drawer-a11y";

export const MOBILE_NAVIGATION_DRAWER_ID = "dashboard-mobile-navigation-drawer";

export function MobileNavigationDrawer({
  triggerRef,
  mainRef,
  openedPathname,
  shouldRestoreFocus,
  onRequestClose,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  mainRef: RefObject<HTMLElement | null>;
  openedPathname: string;
  shouldRestoreFocus: () => boolean;
  onRequestClose: (restoreFocus: boolean) => void;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLElement | null>(null);
  const shouldRestoreTrigger = useCallback(
    () => shouldRestoreFocus() && window.location.pathname === openedPathname,
    [openedPathname, shouldRestoreFocus],
  );
  useNavigationDrawerA11y({
    panelRef,
    triggerRef,
    mainRef,
    shouldRestoreFocus: shouldRestoreTrigger,
    onEscape: () => onRequestClose(true),
  });

  return (
    <ModalPortal>
      <div
        className="sidebar-backdrop is-open mobile-navigation-backdrop"
        data-testid="mobile-navigation-backdrop"
        onClick={() => onRequestClose(true)}
      />
      <aside
        id={MOBILE_NAVIGATION_DRAWER_ID}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.managementNavigation")}
        className="dashboard-sidebar mobile-navigation-drawer"
      >
        <div className="sidebar-brand">
          <img
            src="/brand/VAYLET_Logo_Dark_Background.png"
            alt="VAYLET"
            className="sidebar-logo-full"
          />
          <button
            type="button"
            onClick={() => onRequestClose(true)}
            className="sidebar-close"
            aria-label={t("shell.closeNavigation")}
          >
            <NavIcon name="close" size={20} color="currentColor" />
          </button>
        </div>
        <NavigationContent onNavigate={() => onRequestClose(false)} />
      </aside>
    </ModalPortal>
  );
}
