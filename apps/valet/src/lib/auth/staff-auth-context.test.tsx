import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmployeeApp } from "../../components/employee-app";
import { StaffAuthClient } from "./staff-auth-client";
import { StaffAuthProvider } from "./staff-auth-context";

describe("StaffAuthProvider", () => {
  it("renders children with zero extra wrapper DOM elements or visual differences", () => {
    const client = new StaffAuthClient();
    vi.spyOn(client, "tryRefresh").mockResolvedValue(null);

    const markupWithProvider = renderToStaticMarkup(
      <StaffAuthProvider client={client}>
        <EmployeeApp />
      </StaffAuthProvider>,
    );

    const markupWithoutProvider = renderToStaticMarkup(<EmployeeApp />);

    expect(markupWithProvider).toBe(markupWithoutProvider);
  });

  it("does not render any loading spinner, auth banner, or login screen during initialization", () => {
    const client = new StaffAuthClient();
    vi.spyOn(client, "tryRefresh").mockResolvedValue(null);

    const markup = renderToStaticMarkup(
      <StaffAuthProvider client={client}>
        <div id="test-content">Operational App Content</div>
      </StaffAuthProvider>,
    );

    expect(markup).toBe('<div id="test-content">Operational App Content</div>');
    expect(markup).not.toContain("spinner");
    expect(markup).not.toContain("Loading");
    expect(markup).not.toContain("login");
  });
});
