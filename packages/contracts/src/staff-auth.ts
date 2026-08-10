import { z } from "zod";

const accessTokenPattern = /^vsa1\.[A-Za-z0-9_-]{43}$/;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

export const staffLoginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email(),
    password: z
      .string()
      .min(1)
      .refine((value) => utf8ByteLength(value) <= 1024),
  })
  .strict();

export const staffAuthAccessResponseSchema = z
  .object({
    accessToken: z.string().regex(accessTokenPattern),
    tokenType: z.literal("Bearer"),
    accessExpiresAt: z.string().datetime({ offset: true }),
    sessionExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;
export type StaffAuthAccessResponse = z.infer<
  typeof staffAuthAccessResponseSchema
>;
