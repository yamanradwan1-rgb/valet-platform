import { fileURLToPath } from "node:url";

import {
  validateCustomerReadinessOriginArtifact,
  validateCustomerRewriteArtifact,
  validateCustomerStandaloneArtifact,
} from "./build-contract.mjs";

const apiOrigin = process.env.API_ORIGIN?.trim();
if (!apiOrigin) {
  throw new Error("Customer artifact validation requires build-time API_ORIGIN.");
}

const customerBuildRoot = fileURLToPath(
  new URL("../../apps/customer/.next/", import.meta.url),
);
validateCustomerRewriteArtifact({
  customerBuildRoot,
  expectedApiOrigin: apiOrigin,
});
validateCustomerReadinessOriginArtifact({
  customerBuildRoot,
  expectedApiOrigin: apiOrigin,
});
validateCustomerStandaloneArtifact(customerBuildRoot);
