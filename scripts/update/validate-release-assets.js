/**
 * validate-release-assets.js
 *
 * Fails CI/release if an update payload is incomplete (req #5/#16). Validates
 * either a LOCAL folder (release/ or dev-updates/) or the latest GitHub Release.
 *
 *   node scripts/update/validate-release-assets.js                  # local: ./release
 *   node scripts/update/validate-release-assets.js --dir dev-updates
 *   node scripts/update/validate-release-assets.js --github         # latest GH release
 *
 * Checks:
 *   - latest.yml present + parses
 *   - installer .exe referenced by latest.yml exists as a real asset
 *   - matching .exe.blockmap exists (differential needs it)
 *   - sha512 present in latest.yml and (local mode) matches the file
 *   - version is valid semver
 *   - (github) release is not draft; prerelease only allowed with --allow-prerelease
 *
 * Exit 0 = valid, 1 = invalid (with a clear reason list).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const useGithub = args.includes('--github');
const allowPrerelease = args.includes('--allow-prerelease');
const dirArg = (() => {
  const i = args.indexOf('--dir');
  return i !== -1 ? args[i + 1] : 'release';
})();

const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  problems.push(m);
  console.log(`  ✗ ${m}`);
};

function parseYaml(text) {
  // latest.yml is simple flat YAML — parse just what we need without a dep.
  const out = { files: [] };
  let inFiles = false;
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^files:/.test(line)) { inFiles = true; continue; }
    if (inFiles) {
      const urlM = /^\s*-\s*url:\s*(.+)$/.exec(line);
      const shaM = /^\s*sha512:\s*(.+)$/.exec(line);
      const sizeM = /^\s*size:\s*(\d+)$/.exec(line);
      if (urlM) { cur = { url: urlM[1].trim() }; out.files.push(cur); continue; }
      if (shaM && cur) { cur.sha512 = shaM[1].trim(); continue; }
      if (sizeM && cur) { cur.size = Number(sizeM[1]); continue; }
      if (/^\w/.test(line)) inFiles = false; // dedented — files block ended
    }
    const top = /^(version|path|sha512|releaseDate):\s*(.+)$/.exec(line);
    if (top) out[top[1]] = top[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function sha512Of(file) {
  const h = crypto.createHash('sha512');
  h.update(fs.readFileSync(file));
  return h.digest('base64');
}

function validateLocal(dir) {
  console.log(`Validating local payload: ${dir}`);
  const ymlPath = path.join(dir, 'latest.yml');
  if (!fs.existsSync(ymlPath)) { bad('latest.yml missing'); return; }
  ok('latest.yml present');

  let yml;
  try {
    yml = parseYaml(fs.readFileSync(ymlPath, 'utf8'));
  } catch (e) {
    bad(`latest.yml does not parse: ${e.message}`);
    return;
  }

  if (!yml.version || !/^\d+\.\d+\.\d+/.test(yml.version)) bad(`invalid version: ${yml.version}`);
  else ok(`version ${yml.version}`);

  const exeName = yml.path || (yml.files[0] && yml.files[0].url);
  if (!exeName) { bad('latest.yml has no installer path'); return; }

  const exePath = path.join(dir, exeName);
  if (!fs.existsSync(exePath)) bad(`installer asset missing: ${exeName}`);
  else ok(`installer present: ${exeName}`);

  const blockmap = `${exePath}.blockmap`;
  if (!fs.existsSync(blockmap)) bad(`blockmap missing: ${exeName}.blockmap (differential will fall back to full)`);
  else ok(`blockmap present: ${exeName}.blockmap`);

  const fileEntry = yml.files.find((f) => f.url === exeName) || yml.files[0];
  if (!fileEntry || !fileEntry.sha512) bad('sha512 missing in latest.yml');
  else if (fs.existsSync(exePath)) {
    const actual = sha512Of(exePath);
    if (actual !== fileEntry.sha512) bad(`sha512 mismatch for ${exeName}`);
    else ok('sha512 matches installer');
  }
}

async function validateGithub() {
  console.log('Validating latest GitHub Release via gh CLI');
  const { execFileSync } = await import('node:child_process');
  let json;
  try {
    const out = execFileSync(
      'gh',
      ['release', 'view', '--json', 'tagName,isDraft,isPrerelease,assets'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    json = JSON.parse(out);
  } catch (e) {
    bad(`gh release view failed (is gh installed + authed?): ${e.message}`);
    return;
  }
  if (json.isDraft) bad('release is a DRAFT — electron-updater cannot see it');
  else ok('release is published');
  if (json.isPrerelease && !allowPrerelease) bad('release is PRERELEASE (pass --allow-prerelease for beta)');

  const names = (json.assets || []).map((a) => a.name);
  const hasYml = names.includes('latest.yml');
  const exe = names.find((n) => /Setup-.*\.exe$/.test(n) && !n.endsWith('.blockmap'));
  if (!hasYml) bad('latest.yml asset missing'); else ok('latest.yml asset present');
  if (!exe) bad('installer .exe asset missing');
  else {
    ok(`installer asset: ${exe}`);
    if (!names.includes(`${exe}.blockmap`)) bad(`blockmap asset missing: ${exe}.blockmap`);
    else ok(`blockmap asset: ${exe}.blockmap`);
  }
}

(async () => {
  console.log('── Release asset validation ──────────────────────────');
  if (useGithub) await validateGithub();
  else validateLocal(path.resolve(repoRoot, dirArg));

  console.log('──────────────────────────────────────────────────────');
  if (problems.length) {
    console.error(`FAILED: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('OK: release payload is valid');
})();
