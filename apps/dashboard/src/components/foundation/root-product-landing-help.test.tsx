import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../../lib/auth/staff-auth-context", () => ({
  useStaffAuth: () => ({ identityGeneration: 2, sessionGeneration: 5 }),
}));
vi.mock("../../lib/i18n/locale-provider", () => ({
  useDashboardLocale: () => ({ locale: "en" }),
}));
vi.mock("../../features/help/context-help", () => ({
  ContextHelp: (props: { helpKey: string; scopeIdentity: string }) => (
    <button aria-label={`Help: ${props.helpKey}`} data-scope={props.scopeIdentity} type="button" />
  ),
}));

import { RootProductLanding } from "./root-product-landing";

function view(status: "checking" | "error" | "valid") {
  return renderToStaticMarkup(
    <RootProductLanding
      authorityKey="account-generation-2"
      loadingLabel="Loading"
      navigation={[]}
      navigationStatus={status}
      unavailableLabel="No operational workspace is selected"
    />,
  );
}

describe("root Help authorized owner", () => {
  it("mounts workspace page Help only for valid utility-only authority fallback", () => {
    const html = view("valid");
    expect(html).toContain('aria-label="Help: workspace.page"');
    expect(html).toContain("account-generation-2:2:5");
    expect(html).toContain("No operational workspace is selected");
  });

  it("never shows workspace Help while checking authority or on error fallback", () => {
    for (const status of ["checking", "error"] as const) {
      expect(view(status)).not.toContain("Help: workspace.page");
    }
  });
});
