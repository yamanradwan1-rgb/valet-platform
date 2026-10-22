import { managementAuditOrganizationQuerySchema } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { projectManagementAuditDetails } from
  "../src/modules/management/management-audit-detail-projection";
import { managementAuditFamilyFor } from
  "../src/modules/management/management-audit-event-catalog";

const eventType = "MANAGEMENT_GUEST_INFORMATION_CHANGED";

describe("#316 Guest information management audit projection", () => {
  it("registers the event as an audit-filterable Management event", () => {
    expect(managementAuditFamilyFor(eventType)).toBe("MANAGEMENT");
    expect(managementAuditOrganizationQuerySchema.parse({ eventType }).eventType)
      .toBe(eventType);
  });

  it("emits only a verified operation, never raw content, phone or URLs", () => {
    const details = projectManagementAuditDetails("MANAGEMENT", {
      operation: "PRIVACY_PUBLISHED",
      enText: "Secret unpublished legal copy",
      phone: "+962799999999",
      url: "https://private.example/secret",
      revision: 12,
      scope: "GUEST_INFORMATION",
    }, eventType);
    expect(details).toEqual({ kind: "GUEST_INFORMATION", operation: "PRIVACY_PUBLISHED" });
    expect(JSON.stringify(details)).not.toMatch(/Secret|799999999|private|revision|scope/);
  });

  it("drops malicious or unknown operation strings from the response", () => {
    expect(projectManagementAuditDetails("MANAGEMENT", {
      operation: "PRIVACY_PUBLISHED<script>", phone: "should not escape",
    }, eventType)).toEqual({ kind: "GUEST_INFORMATION" });
    for (const operation of ["PRIVACY_DRAFT_SAVED", "PRIVACY_UNPUBLISHED",
      "CONTACT_COMPANY_DEFAULTS_SAVED", "CONTACT_LOCATION_OVERRIDE_SAVED"]) {
      expect(projectManagementAuditDetails("MANAGEMENT", { operation }, eventType))
        .toEqual({ kind: "GUEST_INFORMATION", operation });
    }
  });
});
