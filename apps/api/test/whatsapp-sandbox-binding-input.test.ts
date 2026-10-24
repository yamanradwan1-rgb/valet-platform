import { describe, expect, it } from "vitest";
import {
  sandboxBindingRequestAllowed, validateSandboxBindingRequest,
} from "../src/modules/notifications/whatsapp-sandbox-binding-input";

const org = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const correct: NodeJS.ProcessEnv = {
  NODE_ENV: "test", OUTBOUND_MESSAGING_MODE: "test",
  OUTBOUND_MESSAGING_SEND_ENABLED: "false",
  OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED: "false",
  GUEST_ACCESS_AUTO_ISSUE_ENABLED: "false",
  OUTBOUND_META_TEST_DATABASE_NAME: "vaylet_wa310",
  OUTBOUND_META_TEST_ORGANIZATION_ID: org,
};

describe("Issue310 sandbox binding request", () => {
  it("accepts only an explicit, field-free pending request", () => {
    expect(() => validateSandboxBindingRequest({
      requestPendingSandboxBinding: true,
    })).not.toThrow();
    for (const value of [
      {}, null, {requestPendingSandboxBinding:false},
      {requestPendingSandboxBinding:true,enabled:true},
      {requestPendingSandboxBinding:true,providerVerifiedAt:"2026-10-24T00:00:00Z"},
    ]) expect(() => validateSandboxBindingRequest(value)).toThrow();
  });

  it("denies other tenants, DBs, modes, and every sending switch", () => {
    expect(sandboxBindingRequestAllowed(correct,org,"vaylet_wa310")).toBe(true);
    expect(sandboxBindingRequestAllowed(correct,"5072955f-f323-448f-8d7d-bd0d3e6bd0b5",
      "vaylet_wa310")).toBe(false);
    expect(sandboxBindingRequestAllowed(correct,org,"valet")).toBe(false);
    for (const [name,value] of [
      ["NODE_ENV","production"],
      ["OUTBOUND_MESSAGING_MODE","production"],
      ["OUTBOUND_MESSAGING_SEND_ENABLED","true"],
      ["OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED","true"],
      ["GUEST_ACCESS_AUTO_ISSUE_ENABLED","true"],
    ] as Array<[string,string]>) {
      expect(sandboxBindingRequestAllowed({...correct,[name]:value},org,
        "vaylet_wa310")).toBe(false);
    }
  });
});
