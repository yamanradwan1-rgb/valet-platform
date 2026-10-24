import { describe, expect, it } from "vitest";
import {
  sandboxConsentScopeAllowed, validateSandboxConsentInput,
} from "../src/modules/notifications/whatsapp-sandbox-consent-input";

const org = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const configured: NodeJS.ProcessEnv = {
  NODE_ENV:"test", OUTBOUND_MESSAGING_MODE:"test",
  OUTBOUND_META_TEST_DATABASE_NAME:"vaylet_wa310",
  OUTBOUND_META_TEST_ORGANIZATION_ID:org,
};
const grant = {
  action:"GRANT", evidenceReference:"wa310-opt-in-owner-confirmed-001",
  expectedRevision:0, explicitOwnerConfirmation:true,
};

describe("Issue310 authenticated consent ceremony input", () => {
  it("requires explicit, revision-bound confirmation without any phone input", () => {
    expect(validateSandboxConsentInput(grant)).toEqual(grant);
    expect(validateSandboxConsentInput({...grant,action:"WITHDRAW"}).action)
      .toBe("WITHDRAW");
    for (const value of [
      {...grant,explicitOwnerConfirmation:false},
      {...grant,phone:"+15550100000"},
      {...grant,recipientDigest:"hmac:v1:forged"},
      {...grant,organizationId:org},
      {...grant,expectedRevision:-1},
      {...grant,evidenceReference:"plain-freeform"},
    ]) expect(() => validateSandboxConsentInput(value)).toThrow();
  });
  it("cannot target a different tenant, DB or production mode", () => {
    expect(sandboxConsentScopeAllowed(configured,org,"vaylet_wa310")).toBe(true);
    expect(sandboxConsentScopeAllowed(configured,org,"valet")).toBe(false);
    expect(sandboxConsentScopeAllowed(configured,
      "5072955f-f323-448f-8d7d-bd0d3e6bd0b5","vaylet_wa310")).toBe(false);
    expect(sandboxConsentScopeAllowed({...configured,NODE_ENV:"production"},
      org,"vaylet_wa310")).toBe(false);
  });
});
