import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { qualifyIssue429 } from "./issue429-qa-qualification.mjs";

const [, , registrationPath, evidencePath] = process.argv;
if (!registrationPath || !evidencePath) {
  throw new Error("Usage: node issue429-qa-evaluate.mjs <preregistered-contract.json> <redacted-qa-evidence.json>");
}
const registration = JSON.parse(readFileSync(resolve(registrationPath), "utf8"));
const evidence = JSON.parse(readFileSync(resolve(evidencePath), "utf8"));
const result = qualifyIssue429(registration, evidence);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (result.status !== "PASS") process.exitCode = 1;
