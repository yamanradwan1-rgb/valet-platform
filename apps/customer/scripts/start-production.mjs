import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.HOSTNAME ||= "127.0.0.1";
process.env.PORT ||= "3002";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await import(
  pathToFileURL(resolve(appRoot, ".next/standalone/apps/customer/server.js"))
    .href
);
