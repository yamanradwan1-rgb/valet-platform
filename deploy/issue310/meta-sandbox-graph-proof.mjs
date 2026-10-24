import { readFileSync } from "node:fs";
import { verifyIssue310MetaAssets } from "./meta-sandbox-graph-authority.mjs";

if (process.env.WA310_RUNTIME_SERVICE !== "sender" ||
    process.env.NODE_ENV !== "test" ||
    process.env.OUTBOUND_MESSAGING_MODE !== "test" ||
    process.env.OUTBOUND_MESSAGING_SEND_ENABLED !== "false" ||
    process.env.OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED !== "false" ||
    process.env.OUTBOUND_META_TEST_DATABASE_NAME !== "vaylet_wa310") {
  throw new Error("Only a disabled, separately identified Issue310 sender may verify Meta assets.");
}

let credential;
try {
  credential = readFileSync("/run/wa310/meta-access-token", "utf8").trim();
} catch {
  throw new Error("The sender-only sandbox token has not been securely installed.");
}
const proof = await verifyIssue310MetaAssets(fetch, credential);
process.stdout.write(`${JSON.stringify(proof)}\n`);
