/**
 * run-local-update-server.js
 *
 * Zero-dependency local update server for DEV testing of the full
 * check → download → (differential) → install flow without publishing to
 * GitHub (req #7). It serves the `dev-updates/` folder and — crucially —
 * supports HTTP Range requests + Accept-Ranges, so electron-updater's
 * differential downloader behaves exactly as it does against GitHub assets.
 *
 *   node scripts/update/run-local-update-server.js [--dir dev-updates] [--port 7070]
 *
 * Put these in the served dir (electron-builder produces them under release/):
 *   latest.yml
 *   NuqtaPlus-Server-Setup-<old>.exe   + .exe.blockmap   (for differential)
 *   NuqtaPlus-Server-Setup-<new>.exe   + .exe.blockmap
 *
 * Point the app at it with:
 *   UPDATER_V2=1 UPDATER_MODE=dev UPDATER_DEV_URL=http://localhost:7070
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('port', process.env.UPDATER_DEV_PORT || 7070));
const dir = path.resolve(repoRoot, arg('dir', 'dev-updates'));

const MIME = {
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.json': 'application/json',
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base)) return null; // path traversal guard
  return p;
}

const server = http.createServer((req, res) => {
  // CORS — harmless for localhost, lets a browser probe assets too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Accept-Ranges', 'bytes');

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = safeJoin(dir, urlPath === '/' ? '/latest.yml' : urlPath);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.end(`not found: ${urlPath}`);
    log(`404 ${urlPath}`);
    return;
  }

  const stat = fs.statSync(filePath);
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.setHeader('Content-Type', type);

  const range = req.headers.range;
  if (range) {
    // bytes=start-end  → partial content (this is what differential uses).
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    log(`206 ${urlPath} ${start}-${end}/${stat.size}`);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
  log(`200 ${urlPath} ${stat.size}b`);
});

function log(msg) {
  console.log(`[update-server] ${msg}`);
}

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
  log(`created empty serve dir: ${dir}`);
}

server.listen(port, () => {
  log(`serving ${dir}`);
  log(`http://localhost:${port}/latest.yml`);
  log(`point the app at it: UPDATER_V2=1 UPDATER_MODE=dev UPDATER_DEV_URL=http://localhost:${port}`);
});
