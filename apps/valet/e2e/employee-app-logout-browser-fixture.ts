import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { EmployeeApp } from "../src/components/employee-app";
import { EmployeeI18nProvider } from "../src/components/shell/employee-i18n";
import { StaffAuthClient } from "../src/lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../src/lib/auth/staff-auth-context";

const root = document.getElementById("root");
if (root) {
  const reactRoot = createRoot(root);
  const client = new StaffAuthClient();
  let revision = 0;
  const renderApp = () => reactRoot.render(
    createElement(EmployeeI18nProvider, { initialLocale: "en" },
      createElement(StaffAuthProvider, { client },
        createElement(EmployeeApp, { key: revision }))),
  );
  Object.assign(window, { __remountEmployeeApp: () => { revision++; renderApp(); } });
  renderApp();
}
