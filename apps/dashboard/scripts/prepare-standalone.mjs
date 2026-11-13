import { access, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = resolve(appRoot, ".next/standalone/apps/dashboard");

await access(resolve(standaloneRoot, "server.js"));
await cp(resolve(appRoot, "public"), resolve(standaloneRoot, "public"), {
  recursive: true,
});
await cp(resolve(appRoot, ".next/static"), resolve(standaloneRoot, ".next/static"), {
  recursive: true,
});
