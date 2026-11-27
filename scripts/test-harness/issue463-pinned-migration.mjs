import { createHash } from "node:crypto";
import {
  ISSUE463_P2_REVIEWED_SQL_SHA256,
  ISSUE463_SHARED_ROLES,
} from "./issue463-shared-role-policy.mjs";
import { attestIssue463SharedRoleInventory } from
  "./issue463-shared-role-attestation.mjs";

export function isIssue463P2Source(text) {
  return typeof text === "string" &&
    (text.includes("ISSUE463_P2_MIGRATOR_OR_GUEST_OWNER_INVALID") ||
      text.includes("$w2_exact_roles$") ||
      (text.includes("CREATE SCHEMA rating_feedback_private") &&
       text.includes("vaylet_rating_feedback_reader_owner")));
}

export function assertReviewedIssue463P2Source(text) {
  const valid = typeof ISSUE463_P2_REVIEWED_SQL_SHA256 === "string" &&
    /^[a-f0-9]{64}$/.test(ISSUE463_P2_REVIEWED_SQL_SHA256) &&
    createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex") ===
      ISSUE463_P2_REVIEWED_SQL_SHA256;
  if (!valid) throw new Error(
    "Issue463 P2 migration source has no final review pin; refusing " +
    "shared-cluster execution.",
  );
}

/** The callback is used only for a scoped, pre-verified SQL migration source.
 * The exact W2 SQL independently preflights PostgreSQL17 and role authority. */
export function executePinnedIssue463Migration(action, args) {
  const callbackIndex = args.findIndex((value) => typeof value === "function");
  const callback = callbackIndex < 0 ? undefined : args[callbackIndex];
  const queryArgs = callbackIndex < 0
    ? args
    : args.filter((_, index) => index !== callbackIndex);
  const operation = (async () => {
    for (const name of ISSUE463_SHARED_ROLES) {
      const result = await action(
        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$1) AS exists",
        [name],
      );
      if (result.rows[0]?.exists !== true) {
        throw new Error(
          "Pinned Issue463 P2 requires all four independently pre-attested " +
          "cluster roles; refusing unowned role creation.",
        );
      }
    }
    await attestIssue463SharedRoleInventory((sql, parameters) =>
      action(sql, parameters));
    return action(...queryArgs);
  })();
  if (callback === undefined) return operation;
  operation.then((result) => callback(null, result), (error) => callback(error));
  return undefined;
}
