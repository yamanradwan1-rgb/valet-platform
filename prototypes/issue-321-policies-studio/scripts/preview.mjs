import { config, vite } from "./runtime.mjs";
const server = await vite.createServer(config);
await server.listen();
server.printUrls();
