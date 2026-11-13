import { assertResolve113Mode, resolveOnlyFailed113 } from "./resolve-113.mjs";

try {
  assertResolve113Mode(process.argv.slice(2));
  const outcome = await resolveOnlyFailed113();
  console.log(`Issue416 W9-only migration ${outcome.migration} marked rolled-back.`);
} catch {
  // Avoid echoing database credentials or Prisma driver params in errors.
  console.error("Issue416 W9-only recovery refused or failed. Check the attested read-only diagnostic and private lease.");
  process.exitCode = 1;
}
