import type { EmployeeReleaseSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeReleasePanel } =
  await import("../src/handoff/native-release-panel");
const { content, elements } =
  await import("./native-check-in-condition-test-support");

type Proof = NonNullable<
  NonNullable<EmployeeReleaseSnapshot["session"]>["handoff"]["verification"]
>;
const verifiedAt = "2026-09-08T09:01:00.000Z";
function verified(method: Proof["method"] = "PICKUP_CODE"): Proof {
  return { method, status: "VERIFIED", verifiedAt };
}
const pending: Proof = {
  method: "PICKUP_CODE",
  status: "PENDING",
  verifiedAt: null,
};

const base: EmployeeReleaseSnapshot = {
  block: null,
  completion: null,
  failure: null,
  identityGeneration: 9,
  phase: "ready",
  releaseRequiresPayment: false,
  releaseSatisfied: true,
  scope: null,
  task: null,
  session: {
    checkIn: { conditionCompletedAt: verifiedAt },
    guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
    handoff: { pendingAt: verifiedAt, verification: verified() },
    keySlot: { code: "K-9" },
    locationId: "11111111-1111-4111-8111-111111111111",
    parking: {
      parkedAt: verifiedAt,
      parkingSpotCode: null,
      parkingStartedAt: verifiedAt,
      parkingZoneCode: null,
    },
    sessionId: "44444444-4444-4444-8444-444444444444",
    state: "HANDOFF_PENDING",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "77777777-7777-4777-8777-777777777777",
      vehicleUpdatedAt: verifiedAt,
    },
    version: 8,
  },
};

function render(
  phase: EmployeeReleaseSnapshot["phase"],
  locale: "en" | "ar" = "en",
  block: EmployeeReleaseSnapshot["block"] = null,
  proof: Proof | null = verified(),
) {
  const session = base.session!;
  const snapshot: EmployeeReleaseSnapshot = {
    ...base,
    block,
    phase,
    session: {
      ...session,
      handoff: { ...session.handoff, verification: proof },
      state: phase === "released" ? "COMPLETED" : "HANDOFF_PENDING",
    },
  };
  return elements(
    NativeReleasePanel({
      locale,
      onBack: vi.fn(),
      onDone: vi.fn(),
      release: { checkServerState: vi.fn(), release: vi.fn() } as never,
      snapshot,
    }),
  );
}

describe("#373 Native Release verification truth", () => {
  it.each([
    ["en", "DYNAMIC_QR", "Identity verified · Guest QR"],
    ["en", "PICKUP_CODE", "Identity verified · Pickup code"],
    ["en", "SUPERVISOR_OVERRIDE", "Identity verified · Supervisor override"],
    ["ar", "DYNAMIC_QR", "تم التحقق من الهوية · رمز QR للضيف"],
    ["ar", "PICKUP_CODE", "تم التحقق من الهوية · رمز الاستلام"],
    ["ar", "SUPERVISOR_OVERRIDE", "تم التحقق من الهوية · تجاوز المشرف"],
  ] as const)("uses exact verified %s %s method", (locale, method, label) => {
    expect(content(render("ready", locale, null, verified(method)))).toContain(
      label,
    );
  });

  it.each([
    ["en", "Identity verified · Guest QR"],
    ["ar", "تم التحقق من الهوية · رمز QR للضيف"],
  ] as const)(
    "keeps verified method while releasing in %s",
    (locale, label) => {
      expect(
        content(render("releasing", locale, null, verified("DYNAMIC_QR"))),
      ).toContain(label);
    },
  );

  it.each([
    ["en", null, "Release blocked", "Identity verified", "Pickup code"],
    ["ar", null, "التسليم محظور", "تم التحقق من الهوية", "رمز الاستلام"],
    ["en", pending, "Release blocked", "Identity verified", "Pickup code"],
    ["ar", pending, "التسليم محظور", "تم التحقق من الهوية", "رمز الاستلام"],
  ] as const)(
    "shows blocked %s missing/pending proof truth",
    (locale, proof, blocked, claim, fallback) => {
      const text = content(render("blocked", locale, "verification", proof));
      expect(text).toContain(blocked);
      expect(text).not.toContain(claim);
      expect(text).not.toContain(fallback);
    },
  );

  it.each(["verification", "financial", "authority"] as const)(
    "does not present a verified release in %s block",
    (block) => {
      const text = content(render("blocked", "en", block));
      expect(text).toContain("Release blocked");
      expect(text).not.toContain("Identity verified");
      expect(text).not.toContain("Pickup code");
    },
  );

  it.each([
    "loading",
    "reconciling",
    "ambiguous",
    "conflict",
    "unavailable",
  ] as const)("does not claim verification while %s", (phase) => {
    const text = content(render(phase));
    expect(text).not.toContain("Identity verified");
    expect(text).not.toContain("Pickup code");
    expect(text).not.toContain("Release blocked");
  });

  it.each([null, pending])(
    "does not offer Release from inconsistent ready with proof %j",
    (proof) => {
      const nodes = render("ready", "en", null, proof);
      expect(content(nodes)).not.toContain("Identity verified");
      expect(content(nodes)).not.toContain("Pickup code");
      expect(
        nodes.find(
          (node) => node.props.accessibilityLabel === "Release Vehicle",
        ),
      ).toBeUndefined();
    },
  );

  it("renders terminal completion without inferring a past proof method", () => {
    const text = content(render("released", "ar", null, null));
    expect(text).toContain("اكتمل التسليم");
    expect(text).not.toContain("رمز الاستلام");
    expect(text).not.toContain("تم التحقق من الهوية");
  });
});
