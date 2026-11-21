import { preflightIssue416Target } from "./target-preflight.mjs";

// May be loaded with Node --import before any DDL-capable child entrypoint.
const identity = await preflightIssue416Target();
if (process.argv[1]?.endsWith("child-preflight.mjs")) {
  console.log(JSON.stringify(identity));
}
