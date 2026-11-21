import { preflightIssue416Target } from "./target-preflight.mjs";
import { assertRecoveryChildTarget } from "./recovery-child-guard.mjs";

// Loaded as Node --import before the exact official Prisma CLI main code.
// Any W9 instance replacement/restart fails before the bookkeeping action.
const identity = await preflightIssue416Target();
assertRecoveryChildTarget(identity);
