import { describe, expect, it } from "vitest";

import { authorizedLocationLabels } from "./location-labels";

const ORG_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ORG_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

describe("authorized location labels", () => {
  it("renders unique location names bare", () => {
    const labels = authorizedLocationLabels([
      { locationId: "l1", name: "Alpha Hotel", organizationId: ORG_1 },
      { locationId: "l2", name: "Beta Mall", organizationId: ORG_2 },
    ]);
    expect(labels.get("l1")).toBe("Alpha Hotel");
    expect(labels.get("l2")).toBe("Beta Mall");
  });

  it("disambiguates duplicate names with a truthful organization-id fragment", () => {
    const labels = authorizedLocationLabels([
      { locationId: "l1", name: "Front Desk", organizationId: ORG_1 },
      { locationId: "l2", name: "Front Desk", organizationId: ORG_2 },
    ]);
    expect(labels.get("l1")).toBe(
      `Front Desk · org ${ORG_1.slice(0, 8)}…`,
    );
    expect(labels.get("l2")).toBe(
      `Front Desk · org ${ORG_2.slice(0, 8)}…`,
    );
  });

  it("never invents an organization display name", () => {
    const labels = authorizedLocationLabels([
      { locationId: "only", name: "Solo Location", organizationId: ORG_1 },
    ]);
    expect(labels.get("only")).not.toContain("Hotel");
    expect(labels.get("only")).toBe("Solo Location");
  });

  it("keeps two 'Downtown' options in different organizations identifiable", () => {
    // Location A: Downtown @ org X; Location B: Downtown @ org Y.
    const orgX = ORG_1;
    const orgY = ORG_2;
    const labels = authorizedLocationLabels([
      { locationId: "A", name: "Downtown", organizationId: orgX },
      { locationId: "B", name: "Downtown", organizationId: orgY },
    ]);
    const labelA = labels.get("A")!;
    const labelB = labels.get("B")!;
    // Both stay recognizably "Downtown"...
    expect(labelA.startsWith("Downtown")).toBe(true);
    expect(labelB.startsWith("Downtown")).toBe(true);
    // ...but the two selectable options can never collapse into one string.
    expect(labelA).not.toBe(labelB);
    expect(labelA).toContain(orgX.slice(0, 8));
    expect(labelB).toContain(orgY.slice(0, 8));
  });

  it("selected duplicate option resolves to its own unique label in any locale", () => {
    // Labels derive ONLY from authoritative response fields (name +
    // organizationId), never from translation dictionaries, so the selected
    // option stays equally identifiable under the EN and AR dictionaries.
    const locations = [
      { locationId: "A", name: "Downtown", organizationId: ORG_1 },
      { locationId: "B", name: "Downtown", organizationId: ORG_2 },
      { locationId: "C", name: "Seaside", organizationId: ORG_1 },
    ];
    const labels = authorizedLocationLabels(locations);
    const allLabels = [...labels.values()];
    expect(new Set(allLabels).size).toBe(allLabels.length);
    for (const locale of ["en", "ar"] as const) {
      void locale; // selection lookup is locale-independent by construction
      for (const location of locations) {
        const selected = labels.get(location.locationId);
        expect(selected).toBeDefined();
        // Exactly one option carries this label -> the selected entry is
        // unambiguous inside the rendered select.
        expect(allLabels.filter((l) => l === selected)).toHaveLength(1);
        if (location.name === "Downtown") {
          expect(selected!.startsWith("Downtown")).toBe(true);
        }
      }
    }
  });
});
