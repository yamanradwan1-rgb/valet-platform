import { describe, expect, it } from "vitest";
import { mapApiError } from "../src/common/http/api-errors";
import {
  approvedTemplates, availableTenantTemplateVersions, templateApprovedForAccount,
} from "../src/modules/notifications/whatsapp-template-authority";
import { validateWhatsAppPolicy } from "../src/modules/notifications/whatsapp-settings-validation";
import { ManagementSettingsError } from "../src/modules/management/management-settings-errors";

const orgA = "f7e34e76-2ddc-45d7-a24e-33f59f50fc63";
const orgB = "30dfe1aa-4a52-470d-9164-84469a67153f";
const config: NodeJS.ProcessEnv = {
  OUTBOUND_APPROVED_META_TEMPLATES_JSON: JSON.stringify([
    { organizationId: orgA, wabaId: "123456", catalogVersion: "approved-v1", locale: "ar" },
    { organizationId: orgA, wabaId: "123456", catalogVersion: "approved-v1", locale: "en" },
    { organizationId: orgB, wabaId: "999999", catalogVersion: "approved-other", locale: "ar" },
  ]),
};

describe("WhatsApp company-authorized server configuration", () => {
  it("never treats a global version or foreign WABA as tenant-approved", () => {
    expect(availableTenantTemplateVersions(config, orgA, ["123456"]))
      .toEqual(["approved-v1"]);
    expect(availableTenantTemplateVersions(config, orgA, ["999999"]))
      .toEqual([]);
    expect(templateApprovedForAccount(config, orgA, "999999", "approved-other", "ar"))
      .toBe(false);
    expect(templateApprovedForAccount(config, orgA, "123456", "approved-v1", "en"))
      .toBe(true);
    expect(templateApprovedForAccount(config, orgA, "123456", "approved-other", "en"))
      .toBe(false);
  });

  it("invalid or absent catalog evidence means no verified templates", () => {
    expect(approvedTemplates({})).toEqual([]);
    expect(approvedTemplates({
      OUTBOUND_APPROVED_META_TEMPLATES_JSON: '[{"organizationId":"*"}]',
    })).toEqual([]);
    expect(approvedTemplates({
      OUTBOUND_APPROVED_META_TEMPLATES_JSON: "{invalid}",
    })).toEqual([]);
  });

  it("validates typed optimistic revision with safe 400/409 HTTP mapping", () => {
    const valid = {
      enabled: false, language: "ar", providerBindingId: null,
      templateCatalogVersion: null, revision: 0, expectedRevision: 0,
    };
    expect(validateWhatsAppPolicy(valid)).toMatchObject({ enabled: false });
    expect(() => validateWhatsAppPolicy({ ...valid, unexpected: "raw-token" }))
      .toThrow();
    try {
      validateWhatsAppPolicy({ ...valid, revision: "0" });
      throw new Error("expected invalid");
    } catch (error) {
      expect(mapApiError(error).status).toBe(400);
    }
    expect(mapApiError(new ManagementSettingsError("CONFIGURATION_CONFLICT")).status)
      .toBe(409);
  });
});
