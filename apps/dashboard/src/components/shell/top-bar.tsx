"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { useAuth } from "../../features/auth/use-auth";
import { useTranslation } from "../../i18n/locale-provider";
import { useTheme } from "../../theme/theme-provider";
import { LocationSwitcher } from "./location-switcher";

interface TopBarProps {
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  mobileNavOpen: boolean;
  mobileNavControls: string;
  onMenuToggle: () => void;
}

export function TopBar({
  menuButtonRef,
  mobileNavOpen,
  mobileNavControls,
  onMenuToggle,
}: TopBarProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { session, signOut } = useAuth();
  const [userOpen, setUserOpen] = useState(false);
  const userAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userOpen) return;
    function onDocumentClick(event: MouseEvent) {
      if (
        userAreaRef.current !== null &&
        !userAreaRef.current.contains(event.target as Node)
      ) {
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [userOpen]);

  const email = session?.email ?? "";
  const initial = email.length > 0 ? email.charAt(0).toUpperCase() : "•";

  return (
    <header className="dashboard-topbar">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onMenuToggle}
        className="topbar-icon-button lg-desktop-hidden"
        aria-label={t("shell.openNavigation")}
        aria-expanded={mobileNavOpen}
        aria-controls={mobileNavControls}
      >
        <svg
          width={20}
          height={20}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 5.5H17M3 10H17M3 14.5H17"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <LocationSwitcher />

      <div className="topbar-actions">
        <button
          type="button"
          onClick={toggleTheme}
          className="topbar-icon-button"
          aria-label={
            theme === "dark"
              ? t("shell.switchToLightTheme")
              : t("shell.switchToDarkTheme")
          }
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="language-switch" role="group">
          <LanguageOption
            locale="en"
            label="EN"
            ariaLabel={t("shell.switchToEnglish")}
          />
          <LanguageOption
            locale="ar"
            labelWide="العربية"
            labelNarrow="AR"
            ariaLabel={t("shell.switchToArabic")}
          />
        </div>

        <div className="topbar-user-area" ref={userAreaRef}>
          <button
            type="button"
            onClick={() => setUserOpen((open) => !open)}
            className="topbar-user"
            aria-expanded={userOpen}
            aria-haspopup="menu"
          >
            <span className="topbar-avatar">{initial}</span>
            <span className="topbar-user-email">
              {email.length > 0 ? email : "\u00A0"}
            </span>
          </button>
          {userOpen && (
            <div className="dashboard-popover" role="menu">
              <button
                type="button"
                role="menuitem"
                className="sign-out-item"
                onClick={() => {
                  setUserOpen(false);
                  void signOut().catch(() => undefined);
                }}
              >
                {t("shell.signOut")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function LanguageOption({
  locale,
  label,
  labelWide,
  labelNarrow,
  ariaLabel,
}: {
  locale: "en" | "ar";
  label?: string;
  labelWide?: string;
  labelNarrow?: string;
  ariaLabel: string;
}) {
  const { locale: active, setLocale } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale)}
      className={`language-switch-option ${active === locale ? "is-active" : ""}`}
      aria-label={ariaLabel}
      aria-pressed={active === locale}
    >
      {label ?? (
        <>
          <span className="sm-only-inline">{labelNarrow}</span>
          <span className="sm-only-hidden">{labelWide}</span>
        </>
      )}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1.8V3M9 15V16.2M16.2 9H15M3 9H1.8M14.1 3.9L13.25 4.75M4.75 13.25L3.9 14.1M14.1 14.1L13.25 13.25M4.75 4.75L3.9 3.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14.7 11.2A6.2 6.2 0 0 1 6.8 3.3 6.2 6.2 0 1 0 14.7 11.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
