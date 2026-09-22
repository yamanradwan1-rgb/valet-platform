import { describe, expect, it } from "vitest";

import { visitContactCopy } from "./visit-contact-copy";
import { normalizeVisitSearchIdentity } from "./visit-contact-query-identity";
import { visitContactPhoneText } from "./visit-contact-presentation";

describe("Visit Contact privacy and presentation", () => {
  it("renders CA FULL phone and LM MASKED final four without hidden full phone", () => {
    const ca = visitContactPhoneText(
      { kind: "FULL", value: "+962791234567" }, "••••",
    );
    const lm = visitContactPhoneText(
      { kind: "MASKED", ending: "4567" }, "••••",
    );
    expect(ca).toBe("+962791234567");
    expect(lm).toBe("•••• 4567");
    expect(lm).not.toContain("+962791234567");
  });

  it("uses visit-association language and no ownership wording", () => {
    const en = visitContactCopy("en");
    expect(en.associatedVehicles).toBe("Vehicles associated through visits");
    expect(JSON.stringify(en).toLowerCase()).not.toContain("owner");
    expect(JSON.stringify(en).toLowerCase()).not.toContain("registered to");
  });

  it("keeps mode identity separate across NAME → PHONE → NAME", () => {
    const draft = {
      name: "  Alice ", phone: " 079 ", plate: "10", plateCountry: "jo",
    };
    expect(normalizeVisitSearchIdentity("NAME", draft)).toBe("NAME:Alice");
    expect(normalizeVisitSearchIdentity("PHONE", draft)).toBe("PHONE:079");
    expect(normalizeVisitSearchIdentity("NAME", draft)).toBe("NAME:Alice");
    expect(normalizeVisitSearchIdentity("PLATE", draft)).toBe("PLATE:JO:10");
  });
});
