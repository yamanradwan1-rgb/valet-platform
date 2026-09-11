import { createHash } from "node:crypto";

export function staffPushTokenHash(providerToken: string): string {
  return `staff-push-token-sha256:v1:${createHash("sha256")
    .update(providerToken, "utf8")
    .digest("hex")}`;
}

export function staffPushLockKeys(input: {
  readonly appIdentifier: string;
  readonly installationId: string;
  readonly provider: string;
  readonly tokenHash: string;
}): readonly string[] {
  const installDigest = createHash("sha256")
    .update(
      `${input.provider}\u0000${input.appIdentifier}\u0000${input.installationId}`,
      "utf8",
    )
    .digest("hex");
  const tokenDigest = createHash("sha256")
    .update(input.tokenHash, "utf8")
    .digest("hex");
  return [
    `staff-push-install-lock:v1:${installDigest}`,
    `staff-push-token-lock:v1:${tokenDigest}`,
  ].sort();
}
