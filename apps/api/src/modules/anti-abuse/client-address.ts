import { isIP } from "node:net";

import { Injectable } from "@nestjs/common";

import type { ApiRequest } from "../../common/http/api-request";

interface ParsedIp {
  readonly bytes: Uint8Array;
  readonly canonical: string;
  readonly family: 4 | 6;
}

interface ParsedCidr extends ParsedIp {
  readonly prefix: number;
}

export class ClientAddressUnavailableError extends Error {
  constructor() {
    super("Authoritative client address is unavailable.");
    this.name = "ClientAddressUnavailableError";
  }
}

function ipv4(value: string): ParsedIp {
  const octets = value.split(".").map(Number);
  return {
    bytes: Uint8Array.from(octets),
    canonical: octets.join("."),
    family: 4,
  };
}

function ipv6Words(value: string): number[] {
  const halves = value.toLowerCase().split("::");
  const parseHalf = (half: string): number[] => {
    if (half === "") return [];
    const parts = half.split(":");
    const words: number[] = [];
    for (const part of parts) {
      if (part.includes(".")) {
        const mapped = ipv4(part).bytes;
        words.push(
          (mapped[0]! << 8) | mapped[1]!,
          (mapped[2]! << 8) | mapped[3]!,
        );
      } else {
        words.push(Number.parseInt(part, 16));
      }
    }
    return words;
  };
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function canonicalIpv6(words: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < words.length;) {
    if (words[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < words.length && words[end] === 0) end += 1;
    if (end - index > bestLength && end - index >= 2) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }
  const parts: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    if (index === bestStart) {
      parts.push("");
      index += bestLength - 1;
      if (index === words.length - 1) parts.push("");
    } else {
      parts.push(words[index]!.toString(16));
    }
  }
  const joined = parts.join(":");
  return joined === "" || joined === ":"
    ? "::"
    : joined.startsWith(":")
      ? `:${joined}`
      : joined;
}

export function parseCanonicalIp(value: string): ParsedIp {
  const family = isIP(value);
  if (family === 4) return ipv4(value);
  if (family !== 6 || value.includes("%"))
    throw new ClientAddressUnavailableError();
  const words = ipv6Words(value);
  const bytes = Uint8Array.from(
    words.flatMap((word) => [word >> 8, word & 255]),
  );
  const mapped = bytes.slice(0, 12);
  if (
    mapped.slice(0, 10).every((byte) => byte === 0) &&
    mapped[10] === 255 &&
    mapped[11] === 255
  ) {
    return ipv4(Array.from(bytes.slice(12)).join("."));
  }
  return { bytes, canonical: canonicalIpv6(words), family: 6 };
}

function parseCidr(value: string): ParsedCidr {
  const pieces = value.split("/");
  if (
    pieces.length !== 2 ||
    pieces[0] === "" ||
    !/^\d+$/.test(pieces[1] ?? "")
  ) {
    throw new Error("ANTI_ABUSE_TRUSTED_PROXY_CIDRS contains an invalid CIDR.");
  }
  let address: ParsedIp;
  try {
    address = parseCanonicalIp(pieces[0]!);
  } catch {
    throw new Error("ANTI_ABUSE_TRUSTED_PROXY_CIDRS contains an invalid CIDR.");
  }
  const prefix = Number(pieces[1]);
  if (prefix < 0 || prefix > address.bytes.length * 8) {
    throw new Error("ANTI_ABUSE_TRUSTED_PROXY_CIDRS contains an invalid CIDR.");
  }
  return { ...address, prefix };
}

function contains(cidr: ParsedCidr, address: ParsedIp): boolean {
  if (cidr.family !== address.family) return false;
  const whole = Math.floor(cidr.prefix / 8);
  const partial = cidr.prefix % 8;
  for (let index = 0; index < whole; index += 1) {
    if (cidr.bytes[index] !== address.bytes[index]) return false;
  }
  if (partial === 0) return true;
  const mask = (0xff << (8 - partial)) & 0xff;
  return (cidr.bytes[whole]! & mask) === (address.bytes[whole]! & mask);
}

function singleRawHeader(request: ApiRequest, header: string): string {
  const rawHeaders = request.rawHeaders;
  if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
    throw new ClientAddressUnavailableError();
  }
  let value: string | undefined;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() !== header) continue;
    if (value !== undefined) throw new ClientAddressUnavailableError();
    value = rawHeaders[index + 1];
  }
  if (value === undefined) throw new ClientAddressUnavailableError();
  return value;
}

@Injectable()
export class TrustedClientAddressResolver {
  private readonly trustedCidrs: readonly ParsedCidr[];

  constructor() {
    const configured = process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS ?? "";
    this.trustedCidrs =
      configured.trim() === ""
        ? []
        : configured.split(",").map((entry) => parseCidr(entry.trim()));
  }

  private isTrusted(address: ParsedIp): boolean {
    return this.trustedCidrs.some((cidr) => contains(cidr, address));
  }

  resolve(request: ApiRequest): string {
    const peerValue = request.socket?.remoteAddress;
    if (peerValue === undefined) throw new ClientAddressUnavailableError();
    let peer: ParsedIp;
    try {
      peer = parseCanonicalIp(peerValue);
    } catch {
      throw new ClientAddressUnavailableError();
    }
    if (!this.isTrusted(peer)) return peer.canonical;
    const header = singleRawHeader(request, "x-forwarded-for");
    const parts = header.split(",").map((entry) => entry.trim());
    if (parts.length === 0 || parts.some((entry) => entry === "")) {
      throw new ClientAddressUnavailableError();
    }
    let chain: ParsedIp[];
    try {
      chain = parts.map(parseCanonicalIp);
    } catch {
      throw new ClientAddressUnavailableError();
    }
    chain.push(peer);
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const hop = chain[index]!;
      if (!this.isTrusted(hop)) return hop.canonical;
    }
    throw new ClientAddressUnavailableError();
  }
}
