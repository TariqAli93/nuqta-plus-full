import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUpdaterConfig, isUpdaterV2Enabled } from '../updater.config.js';

test('defaults to github/stable with differential on', () => {
  const c = resolveUpdaterConfig({}, { isPackaged: true, appMode: 'server' });
  assert.equal(c.mode, 'github');
  assert.equal(c.channel, 'stable');
  assert.equal(c.allowPrerelease, false);
  assert.equal(c.differentialEnabled, true);
  assert.equal(c.devUrl, null);
  assert.equal(c.appMode, 'server');
});

test('dev mode resolves the local provider url', () => {
  const c = resolveUpdaterConfig(
    { UPDATER_MODE: 'dev', UPDATER_DEV_URL: 'http://localhost:7070/' },
    { isPackaged: false, appMode: 'server' }
  );
  assert.equal(c.mode, 'dev');
  assert.equal(c.devUrl, 'http://localhost:7070'); // trailing slash trimmed
});

test('beta channel enables prerelease', () => {
  const c = resolveUpdaterConfig({ UPDATER_CHANNEL: 'beta' }, { isPackaged: true });
  assert.equal(c.channel, 'beta');
  assert.equal(c.allowPrerelease, true);
});

test('differential can be explicitly disabled', () => {
  const c = resolveUpdaterConfig({ UPDATER_DISABLE_DIFFERENTIAL: '1' }, { isPackaged: true });
  assert.equal(c.differentialEnabled, false);
});

test('client appMode is preserved', () => {
  const c = resolveUpdaterConfig({}, { isPackaged: true, appMode: 'client' });
  assert.equal(c.appMode, 'client');
});

test('UpdaterV2 is opt-in (off by default)', () => {
  assert.equal(isUpdaterV2Enabled({}), false);
  assert.equal(isUpdaterV2Enabled({ UPDATER_V2: '1' }), true);
  assert.equal(isUpdaterV2Enabled({ UPDATER_V2: '0' }), false);
});
