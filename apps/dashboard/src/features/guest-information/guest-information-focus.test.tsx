import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GuestField, guestContactFieldId, guestPrivacyFieldId,
} from "./approved-elements";
import { CONTACT_FIELDS } from "./guest-information-model";

describe("guest information production form focus wiring", () => {
  it("keeps rendered contact labels and inputs bound to validation focus targets", () => {
    for (const prefix of ["company", "override"] as const) {
      for (const field of CONTACT_FIELDS) {
        const target = guestContactFieldId(prefix, field);
        const markup = renderToStaticMarkup(
          <GuestField prefix={prefix} field={field} locale="en"
            value="" onChange={() => undefined} />,
        );
        expect(markup).toContain(`for="${target}"`);
        expect(markup).toContain(`id="${target}"`);
        expect(markup).toContain(`data-field="${prefix}.${field}"`);
      }
    }
  });

  it("keeps privacy validation targets unique and tied to the selected fields", () => {
    expect(guestPrivacyFieldId("text")).toBe("guest-information-privacy-text");
    expect(guestPrivacyFieldId("url")).toBe("guest-information-privacy-url");
    expect(guestPrivacyFieldId("text")).not.toBe(guestPrivacyFieldId("url"));
  });
});
