// Static, localhost-only Issue #304 design previews. Zero API/proxy capabilities.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.VAYLET304_PORT || 3040);
const allowed = new Set(['/option-1.html','/option-2.html','/option-3.html','/option-4.html']);
const screenshotPath = /^\/evidence\/screenshots\/option-[1-4]-(320|390|768|1440)-(en|ar)-(light|dark)\.png$/;
const server = createServer(async (request, response) => {
  const target = new URL(request.url || '/', 'http://127.0.0.1');
  const isScreenshot = screenshotPath.test(target.pathname);
  if ((!allowed.has(target.pathname) && !isScreenshot) || request.method !== 'GET') {
    response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    response.end('Only four Issue #304 design HTML pages are available.');
    return;
  }
  try {
    const content = await readFile(join(root, target.pathname.slice(1)));
    response.writeHead(200, {
      'Content-Type': isScreenshot ? 'image/png' : 'text/html; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; form-action 'none'",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    response.end('Option has not been built.');
  }
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write('VAYLET Issue #304 offline previews: http://127.0.0.1:' + port + '/option-1.html through option-4.html\n');
});
