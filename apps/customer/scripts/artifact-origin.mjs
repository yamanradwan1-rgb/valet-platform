import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const guestRewriteSource = "/api/v1/guest/:path*";
const guestUpstreamPath = "/v1/guest/:path*";

function rewriteCandidates(manifest) {
  const rewrites = manifest.rewrites;
  return Array.isArray(rewrites)
    ? rewrites
    : [
        ...(rewrites?.beforeFiles ?? []),
        ...(rewrites?.afterFiles ?? []),
        ...(rewrites?.fallback ?? []),
      ];
}

export function customerApiOriginFromRoutesManifest(manifest) {
  const matches = rewriteCandidates(manifest).filter(
    (rewrite) => rewrite?.source === guestRewriteSource,
  );
  if (matches.length !== 1 || typeof matches[0]?.destination !== "string") {
    throw new Error(
      "Customer artifact must contain exactly one Guest API rewrite.",
    );
  }
  const destination = new URL(matches[0].destination);
  if (
    destination.pathname !== guestUpstreamPath ||
    destination.search !== "" ||
    destination.hash !== "" ||
    destination.username !== "" ||
    destination.password !== ""
  ) {
    throw new Error("Customer Guest API rewrite destination is invalid.");
  }
  return destination.origin;
}

export function readCustomerArtifactApiOrigin(standaloneAppRoot) {
  const manifest = JSON.parse(
    readFileSync(
      resolve(standaloneAppRoot, ".next/routes-manifest.json"),
      "utf8",
    ),
  );
  return customerApiOriginFromRoutesManifest(manifest);
}

/**
 * A correctly built immutable artifact is not proof it belongs to this
 * deployment. Require a second, deployment-authoritative API origin and fail
 * startup on any mismatch before loading Next or accepting Guest credentials.
 */
export function assertArtifactMatchesDeployment(
  artifactOrigin,
  expectedOrigin,
) {
  if (typeof expectedOrigin !== "string" || expectedOrigin.trim() === "") {
    throw new Error("Customer deployment API_ORIGIN is required.");
  }
  let origin;
  try {
    origin = new URL(expectedOrigin);
  } catch {
    throw new Error("Customer deployment API_ORIGIN is invalid.");
  }
  if (
    expectedOrigin !== origin.origin ||
    origin.username !== "" ||
    origin.password !== "" ||
    !(
      origin.protocol === "https:" ||
      (origin.protocol === "http:" &&
        (origin.hostname === "127.0.0.1" || origin.hostname === "[::1]"))
    )
  ) {
    throw new Error("Customer deployment API_ORIGIN is invalid.");
  }
  if (artifactOrigin !== origin.origin) {
    throw new Error(
      "Customer build artifact does not match deployment API_ORIGIN.",
    );
  }
}
