import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** Fingerprint all compiled modules, not only dist/main.js. */
export function r2ApiBundleDigest(entrypoint: string,
  expectedEntry: "main.js" | "index.js" = "main.js"): string | null {
  try {
    const main = resolve(entrypoint);
    if (!main.endsWith(join("dist", expectedEntry))) return null;
    const base = dirname(main);
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (files.length > 12000 || entry.isSymbolicLink())
          throw new Error("Unexpected compiled API artifact");
        const file = join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) {
          if (lstatSync(file).nlink !== 1)
            throw Error("Hard-linked compiled module forbidden");
          files.push(file);
        } else throw new Error("Unexpected compiled artifact");
      }
    };
    walk(base);
    if (!files.includes(main)) return null;
    const hash = createHash("sha256");
    for (const file of files.sort((a, b) => a.localeCompare(b, "en"))) {
      hash.update(relative(base, file).replaceAll("\\", "/"))
        .update("\0").update(readFileSync(file)).update("\0");
    }
    return hash.digest("hex");
  } catch {
    return null;
  }
}
