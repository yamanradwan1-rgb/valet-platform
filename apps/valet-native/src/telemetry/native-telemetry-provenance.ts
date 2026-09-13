/**
 * Native telemetry provenance reader (MOB-024A).
 *
 * This is the ONLY Native telemetry module allowed to import platform APIs
 * (expo-application + react-native Platform): keeping build provenance
 * reading here isolates the platform seam, mirroring the iOS-portability
 * requirement. An iOS counterpart reuses the owner/ring/vocabulary
 * unchanged and swaps ONLY this module's reader.
 *
 * Everything is guarded: telemetry construction must never crash the app.
 * Missing/blank Application metadata yields bounded "unknown" strings —
 * never the raw platform value, never an exception.
 */
import * as Application from "expo-application";
import { Platform } from "react-native";

import type { EmployeeTelemetryProvenance } from "@valet/employee-client";

import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  installNativeTelemetry,
} from "./native-telemetry-owner";

const UNKNOWN = "unknown";

/** Bounded non-blank string, or "unknown". Never raw platform values. */
function bounded(value: unknown): string {
  try {
    if (typeof value !== "string") return UNKNOWN;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 128) return UNKNOWN;
    if (!/^[A-Za-z0-9._-]*$/.test(trimmed)) return UNKNOWN;
    return trimmed;
  } catch {
    return UNKNOWN;
  }
}

function readPlatform(): string {
  try {
    const os = Platform.OS;
    if (typeof os !== "string") return UNKNOWN;
    const normalized = os.toLowerCase();
    if (!/^[a-z0-9]+$/.test(normalized)) return UNKNOWN;
    return normalized;
  } catch {
    return UNKNOWN;
  }
}

/**
 * Build provenance from the running Expo application. Fails open to
 * "unknown" fields; never throws, even when expo-application is unusable.
 */
export function resolveNativeTelemetryProvenance(): EmployeeTelemetryProvenance {
  return {
    appBuild: safeRead(() => Application.nativeBuildVersion),
    appVersion: safeRead(() => Application.nativeApplicationVersion),
    platform: readPlatform(),
  };
}

function safeRead(read: () => unknown): string {
  try {
    return bounded(read());
  } catch {
    return UNKNOWN;
  }
}

export interface NativeTelemetryWiring {
  readonly owner: NativeTelemetryOwner;
  readonly collector: BoundedTelemetryBuffer;
}

/**
 * Convenience constructor wiring owner + bounded memory collector together.
 * Also installs the module registry (getNativeTelemetry()) so later call
 * sites record into this owner. Never throws.
 */
export function createNativeTelemetry(): NativeTelemetryWiring {
  const provenance = resolveNativeTelemetryProvenance();
  const collector = new BoundedTelemetryBuffer();
  const owner = new NativeTelemetryOwner(collector, provenance);
  installNativeTelemetry(owner);
  return { collector, owner };
}
