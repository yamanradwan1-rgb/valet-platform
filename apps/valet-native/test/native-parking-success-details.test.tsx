import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("../src/employee-ui/employee-icons", () => ({
  EmployeeBigCheckIcon: () => ({ type: "BigCheck", props: {} }),
}));

const { NativeParkingSuccess } =
  await import("../src/parking/native-parking-success");
const { getNativeParkingConfirmCopy } =
  await import("../src/parking/native-parking-confirm-copy");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

function render(locale: "en" | "ar" = "en", keySlotCode = "K-03") {
  const nodes = elements(
    NativeParkingSuccess({
      copy: getNativeParkingConfirmCopy(locale),
      onDone: vi.fn(),
      snapshot: {
        parked: {
          keySlotCode,
          parkedAt: "2026-09-09T08:30:00.000Z",
          parkingSpotCode: "P-101",
          sessionVersion: 5,
          source: "reconciliation",
        },
        session: {
          parking: { parkingZoneCode: "A" },
          vehicle: {
            make: "Toyota",
            model: "Camry",
            plateNumberRaw: "12-34567",
            temporaryDescriptor: null,
          },
        },
      } as never,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
  return nodes;
}

describe("UI-PARITY-09 parked success detail rows", () => {
  it.each([
    [
      "en",
      "Vehicle parked and key returned",
      "Parking confirmed",
      "Vehicle",
      "Location",
      "Key slot",
      "Zone A · Spot P-101",
    ],
    [
      "ar",
      "تم صف السيارة وإعادة المفتاح",
      "تم تأكيد الإيقاف",
      "المركبة",
      "الموقع",
      "خانة المفتاح",
      "المنطقة A · الموقع P-101",
    ],
  ] as const)(
    "renders divided InfoRows in %s",
    (locale, title, confirmation, vehicle, location, key, place) => {
      const nodes = render(locale);
      const copy = content(nodes);
      expect(copy).toContain(title);
      expect(copy).toContain(confirmation);
      expect(copy).toContain(vehicle);
      expect(copy).toContain(location);
      expect(copy).toContain(key);
      expect(copy).toContain(place);
      expect(copy).toContain("K-03");
      const rows = nodes.filter((node) => style(node).paddingVertical === 12);
      expect(rows).toHaveLength(3);
      expect(
        rows.filter((node) => style(node).borderBottomWidth === 1),
      ).toHaveLength(2);
      expect(nodes.some((node) => node.type === "BigCheck")).toBe(true);
      expect(
        style(nodes.find((node) => node.props.children === "12-34567")!),
      ).toMatchObject({
        writingDirection: "ltr",
      });
    },
  );

  it("omits the Key row when no authoritative key binding exists", () => {
    const nodes = render("en", "");
    expect(content(nodes)).not.toContain("Key slot");
    expect(
      nodes.filter((node) => style(node).paddingVertical === 12),
    ).toHaveLength(2);
  });

  it("keeps human vehicle text RTL-aware and identifiers LTR", () => {
    const nodes = render("ar");
    expect(
      style(
        nodes.find(
          (node) =>
            Array.isArray(node.props.children) &&
            node.props.children.includes("Toyota Camry"),
        )!,
      ),
    ).toMatchObject({ writingDirection: "rtl" });
    for (const identifier of ["12-34567", "المنطقة A · الموقع P-101", "K-03"]) {
      expect(
        style(nodes.find((node) => node.props.children === identifier)!),
      ).toMatchObject({
        writingDirection: "ltr",
      });
    }
  });
});
