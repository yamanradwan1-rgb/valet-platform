import {
  staffActivationRequestSchema,
  staffActivationResponseSchema,
} from "@valet/contracts";

export class StaffActivationPageError extends Error {
  constructor(readonly retryAfter: number | null = null) {
    super("Activation failed.");
  }
}

export async function activateStaffAccount(
  inviteToken: string,
  password: string,
  signal: AbortSignal,
) {
  const parsed = staffActivationRequestSchema.safeParse({
    inviteToken,
    password,
  });
  if (!parsed.success) throw new StaffActivationPageError();
  const response = await fetch("/v1/staff/auth/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) {
    const seconds = Number(response.headers.get("Retry-After"));
    throw new StaffActivationPageError(
      response.status === 429
        ? Math.min(900, Math.max(1, Number.isFinite(seconds) ? seconds : 900))
        : null,
    );
  }
  const result = staffActivationResponseSchema.safeParse(await response.json());
  if (!result.success) throw new StaffActivationPageError();
  return result.data;
}
