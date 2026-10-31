import { createRoot } from "react-dom/client";
import { DashboardLocaleProvider } from "@dashboard/lib/i18n/locale-provider";
import { DashboardThemeProvider } from "@dashboard/lib/theme/theme-provider";
import { App } from "./App";
import "@dashboard/app/globals.css";
import "./workspace.css";
import "./workspace-feedback.css";
import "./responsive.css";
import "./editors.css";
import "./zone-map.css";
import "./usability.css";

// No API clients are composed. Block accidental browser data transport too.
window.fetch = async () => {
  throw new Error("Prototype data transport is disabled");
};
XMLHttpRequest.prototype.open = () => {
  throw new Error("Prototype data transport is disabled");
};
navigator.sendBeacon = () => false;

const params = new URLSearchParams(location.search);
if (params.has("locale"))
  localStorage.setItem(
    "vaylet_dashboard_locale",
    params.get("locale") === "ar" ? "ar" : "en",
  );
if (params.has("theme"))
  localStorage.setItem(
    "vaylet_dashboard_theme",
    params.get("theme") === "dark" ? "dark" : "light",
  );

createRoot(document.getElementById("root")!).render(
  <DashboardLocaleProvider>
    <DashboardThemeProvider>
      <App />
    </DashboardThemeProvider>
  </DashboardLocaleProvider>,
);
