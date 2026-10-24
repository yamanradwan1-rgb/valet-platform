const passed = (condition) => condition === true ? "PASS" : "BLOCKED";

/** Read-only, non-secret facts. External evidence is never inferred from an ID. */
export function issue310LastMileGates(facts) {
  const gates = {
    isolatedDatabase: passed(facts.database === "vaylet_wa310"),
    migrations: passed(facts.migrationTotal === 102 && facts.migrationFinished === 102
      && facts.migrationIncomplete === 0),
    restrictedPrincipals: passed(facts.principalsAreDistinct && facts.senderHasNarrowExecute
      && !facts.senderHasBroadIntentSelect),
    tenantScope: passed(facts.organizationCount === 1 && facts.locationCount === 1
      && facts.exactOrganization && facts.exactLocation),
    bothDurableEnvironmentsOff: passed(facts.controls?.length === 2
      && facts.controls.every((control) => !control.issueEnabled && !control.sendEnabled)),
    localActivationOff: passed(facts.localActivationOff),
    providerBinding: passed(facts.bindingCount === 1 && facts.verifiedBindingCount === 1),
    companyAndLocationPolicy: passed(facts.companyPolicyReady && facts.locationPolicyReady),
    currentConsentGrant: passed(facts.currentConsentCount === 1),
    templateRegistry: passed(facts.templateRegistryComplete),
    portlessCustomerHttps: passed(facts.cleanHttpsOrigin),
    genuineMetaOwnershipEvidence: "UNVERIFIED_EXTERNALLY",
    recipientMetaEnrollmentAndOptIn: "UNVERIFIED_EXTERNALLY",
    actualPhoneHttpsAndGuestBootstrap: "UNVERIFIED_EXTERNALLY",
  };
  return {
    classification: Object.values(gates).every((status) => status === "PASS")
      ? "READY_FOR_OWNER_TOKEN_AND_ONE_SEND" : "CONFIG_BLOCKED",
    gates,
  };
}
