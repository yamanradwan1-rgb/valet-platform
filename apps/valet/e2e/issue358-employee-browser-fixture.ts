import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { EmployeeApp } from "../src/components/employee-app";
import { EmployeeI18nProvider } from "../src/components/shell/employee-i18n";
import { StaffAuthClient } from "../src/lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../src/lib/auth/staff-auth-context";

const root = document.getElementById("root");
if (root) {
  const client = new StaffAuthClient();
  const reactRoot = createRoot(root);
  reactRoot.render(
    createElement(
      EmployeeI18nProvider,
      { initialLocale: "en" },
      createElement(StaffAuthProvider, { client }, createElement(EmployeeApp)),
    ),
  );
  Object.assign(window, {
    __issue358RefreshToken: () => client.refresh(),
    __issue358Logout: () => client.logout(),
  });
}
