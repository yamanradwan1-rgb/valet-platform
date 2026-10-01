import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

import type { StaffPasswordVerifier } from "./staff-auth-types";

export const STAFF_AUTH_DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$dmF5bGV0LWR1bW15LXYwMQ$GwCTUHTzbfRTG4lBOkCBl3m1yb8/4PKLBerf0R1sgnQ";

function base64DecodedLength(value: string): number | undefined {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined;
  try {
    const decoded = Buffer.from(value, "base64");
    const canonical = decoded.toString("base64").replace(/=+$/, "");
    return canonical === value.replace(/=+$/, "") ? decoded.length : undefined;
  } catch {
    return undefined;
  }
}

export function isAcceptedStaffPasswordHash(value: string): boolean {
  const parts = value.split("$");
  if (parts.length !== 6 || parts[0] !== "" || parts[1] !== "argon2id") {
    return false;
  }
  if (parts[2] !== "v=19") return false;
  const parameterEntries = (parts[3] ?? "").split(",");
  const parameters = new Map(
    parameterEntries.map((entry) => {
      const [key, parameterValue] = entry.split("=", 2);
      return [key, parameterValue] as const;
    }),
  );
  return (
    parameterEntries.length === 3 &&
    parameters.size === 3 &&
    parameters.get("m") === "65536" &&
    parameters.get("t") === "3" &&
    parameters.get("p") === "4" &&
    base64DecodedLength(parts[4] ?? "") === 16 &&
    base64DecodedLength(parts[5] ?? "") === 32
  );
}

@Injectable()
export class Argon2StaffPasswordVerifier implements StaffPasswordVerifier {
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
