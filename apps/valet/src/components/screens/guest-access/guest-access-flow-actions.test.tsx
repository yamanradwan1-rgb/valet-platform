import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  GuestAccessErrorCode,
  GuestAccessView,
} from "../../../features/guest-access";
import { presentGuestAccessError } from "../../../features/guest-access/guest-access-error-presentation";
import { employeeDictionary } from "../../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "../../shell/employee-i18n";
import { GuestAccessFlow, deriveGuestAccessActions } from "./guest-access-flow";

const sessionId = "11111111-1111-4111-8111-111111111111";
const LINK = "https://customer.example.com/#guestToken=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";

vi.mock("../../../features/guest-access", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../features/guest-access")>();
  return {
    ...actual,
    useGuestAccess: vi.fn(),
  };
});

const { useGuestAccess } = await import("../../../features/guest-access");

const ALL_CODES: GuestAccessErrorCode[] = [
  "CONFIG_INVALID",
  "GENERATED_CREDENTIAL_INVALID",
  "INTENT_CONFLICT",
  "LOAD_FAILED",
  "OFFLINE",
  "OUTCOME_UNKNOWN",
  "REVOKE_FAILED",
  "UPDATE_FAILED",
];

function stubView(overrides: Partial<GuestAccessView>): GuestAccessView {
  return {
    expiresAt: "2026-08-22T18:05:00.000Z",
    isMutating: false,
    loadErrorCode: null,
    mutationErrorCode: null,
    phase: "ready",
    shareableUrl: null,
    revokedAt: null,
    status: null,
    ...overrides,
  };
}

function renderWith(
  view: GuestAccessView,
  locale?: "ar" | "en",
): string {
  vi.mocked(useGuestAccess).mockReturnValue({
    view,
    create: vi.fn(),
    load: vi.fn(),
    revoke: vi.fn(),
  });
  const flow = (
    <GuestAccessFlow nav={vi.fn()} returnScreen="task-queue" sessionId={sessionId} />
  );
  if (locale === undefined) return renderToStaticMarkup(flow);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={locale}>{flow}</EmployeeI18nProvider>,
  );
}

describe("deriveGuestAccessActions", () => {
  it("maps NOT_ISSUED to direct creation without confirmation", () => {
    const a = deriveGuestAccessActions("NOT_ISSUED");
    expect(a.primary).toEqual({ kind: "CREATE", requiresConfirm: false });
    expect(a.showRevoke).toBe(false);
  });

  it("requires confirmation for reissue of ACTIVE with a fresh link", () => {
    const a = deriveGuestAccessActions("ACTIVE");
    expect(a.primary).toEqual({ kind: "REISSUE", requiresConfirm: true });
    expect(a.showRevoke).toBe(true);
  });

  it("requires confirmation for reissue of ACTIVE without a fresh link", () => {
    const a = deriveGuestAccessActions("ACTIVE");
    expect(a.primary).toEqual({ kind: "REISSUE", requiresConfirm: true });
    expect(a.showRevoke).toBe(true);
  });

  it("maps EXPIRED to direct reissue without confirmation or revoke", () => {
    const a = deriveGuestAccessActions("EXPIRED");
    expect(a.primary).toEqual({ kind: "REISSUE", requiresConfirm: false });
    expect(a.showRevoke).toBe(false);
  });

  it("maps REVOKED to create-new access using the exact revokedAt intent", () => {
    const a = deriveGuestAccessActions("REVOKED");
    expect(a.primary).toEqual({ kind: "CREATE_NEW", requiresConfirm: false });
    expect(a.showRevoke).toBe(false);
  });
});

describe("GuestAccessFlow action labels and origin config", () => {
  it("renders the correct label per authoritative status", () => {
    vi.stubEnv("NEXT_PUBLIC_CUSTOMER_APP_ORIGIN", "https://customer.example.com");
    try {
      const notIssued = renderWith(stubView({ status: "NOT_ISSUED" }));
      expect(notIssued).toContain("Create Guest Access");
      expect(notIssued).not.toContain("Reissue Access");

      const activeNoLink = renderWith(stubView({ status: "ACTIVE" }));
      expect(activeNoLink).toContain("Reissue Access");

      const expired = renderWith(stubView({ status: "EXPIRED" }));
      expect(expired).toContain("Reissue Access");
      expect(expired).not.toContain("Create Guest Access");

      const revokedState = renderWith(stubView({ status: "REVOKED" }));
      expect(revokedState).toContain("Create New Access");
      expect(revokedState).not.toContain("Create Guest Access");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("shows the configuration error on entry and blocks Create/Reissue while keeping Revoke", () => {
    vi.stubEnv("NEXT_PUBLIC_CUSTOMER_APP_ORIGIN", "");
    try {
      const markup = renderWith(
        stubView({ status: "ACTIVE", shareableUrl: null }),
      );
      expect(markup).toContain("not configured correctly");
      // Primary (reissue) rendered but disabled; revoke remains enabled.
      expect(markup).toContain("disabled");
      expect(markup).toContain("Reissue Access");
      expect(markup).toContain("Revoke Access");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("suppresses QR/copy/open surfaces when origin configuration fails closed", () => {
    vi.stubEnv("NEXT_PUBLIC_CUSTOMER_APP_ORIGIN", "http://customer.example.com");
    try {
      const markup = renderWith(
        stubView({ status: "ACTIVE", shareableUrl: LINK }),
      );
      expect(markup).toContain("not configured correctly");
      expect(markup).not.toContain("Copy Guest Link");
      expect(markup).not.toContain("Open Guest App");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("Guest Access error localization", () => {
  const ENGLISH_CONTROLLER_WORDBY = [
    "You appear to be offline.",
    "Guest link configuration is invalid.",
    "Generated guest access was invalid.",
    "changed elsewhere",
    "outcome is unknown",
    "could not be updated",
    "Revocation failed.",
    "state could not be loaded.",
  ];

  it("maps every error code to distinct bilingual dictionary copy", () => {
    const en = employeeDictionary("en");
    const ar = employeeDictionary("ar");
    for (const code of ALL_CODES) {
      const enText = presentGuestAccessError(code, en);
      const arText = presentGuestAccessError(code, ar);
      expect(enText.length).toBeGreaterThan(0);
      expect(arText).not.toBe(enText);
      // Arabic copy is Arabic-script and never echoes the English wording.
      expect(arText).toMatch(/[\u0600-\u06FF]/);
      expect(ENGLISH_CONTROLLER_WORDBY.some((w) => arText.includes(w))).toBe(
        false,
      );
    }
  });

  it("renders Arabic Guest Access errors without any English controller message", () => {
    vi.stubEnv("NEXT_PUBLIC_CUSTOMER_APP_ORIGIN", "https://customer.example.com");
    try {
      const markup = renderWith(
        stubView({ mutationErrorCode: "INTENT_CONFLICT" }),
        "ar",
      );
      expect(markup).toContain("تغيّر وصول الضيف");
      expect(markup).not.toContain("changed elsewhere");
      expect(markup).not.toContain("You appear to be offline");
      expect(markup).not.toContain("not configured correctly");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("renders the English safe wording for English locale", () => {
    vi.stubEnv("NEXT_PUBLIC_CUSTOMER_APP_ORIGIN", "https://customer.example.com");
    try {
      const markup = renderWith(
        stubView({ mutationErrorCode: "INTENT_CONFLICT" }),
        "en",
      );
      expect(markup).toContain("changed elsewhere");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
