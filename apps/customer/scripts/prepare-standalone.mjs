import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = resolve(appRoot, ".next/standalone/apps/customer");

async function replaceDirectory(source, destination) {
  await rm(destination, { force: true, recursive: true });
  await cp(source, destination, { recursive: true });
}

await replaceDirectory(
  resolve(appRoot, "public"),
  resolve(standaloneRoot, "public"),
);
await replaceDirectory(
  resolve(appRoot, ".next/static"),
  resolve(standaloneRoot, ".next/static"),
);
