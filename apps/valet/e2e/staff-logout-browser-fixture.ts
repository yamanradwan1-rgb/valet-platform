import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { StaffAuthClient } from "../src/lib/auth/staff-auth-client";
import { StaffAuthProvider, useStaffAuth } from "../src/lib/auth/staff-auth-context";

function StaffAuthFixture() {
  const auth = useStaffAuth();
  return createElement(
    "div",
    null,
    createElement("p", { id: "staff-auth-status" }, auth.status),
    createElement("p", { id: "staff-auth-token" }, auth.session?.accessToken ?? ""),
    createElement("button", {
      id: "sign-in",
      onClick: () => void auth.login({
        email: "shared-browser-user@valet.test",
        password: "SharedBrowserPassword123!",
      }),
    }, "Sign in"),
    createElement("button", {
      id: "sign-out",
      onClick: () => void auth.logout().catch(() => {}),
    }, "Sign out"),
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    createElement(StaffAuthProvider, { client: new StaffAuthClient() },
      createElement(StaffAuthFixture)),
  );
}
