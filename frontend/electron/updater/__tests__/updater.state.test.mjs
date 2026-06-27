import test from 'node:test';
import assert from 'node:assert/strict';
import { UpdaterStateMachine } from '../updater.state.js';
import { STATES } from '../updater.events.js';

test('starts idle with a snapshot', () => {
  const m = new UpdaterStateMachine();
  assert.equal(m.state, STATES.IDLE);
  assert.equal(m.snapshot().state, 'idle');
});

test('allows the full happy-path lifecycle', () => {
  const seen = [];
  const m = new UpdaterStateMachine((s) => seen.push(s.state));
  m.transition(STATES.CHECKING);
  m.transition(STATES.UPDATE_AVAILABLE, { nextVersion: '1.0.18' });
  m.transition(STATES.DOWNLOADING);
  m.transition(STATES.DOWNLOADED);
  m.transition(STATES.READY_TO_INSTALL);
  m.transition(STATES.INSTALLING);
  m.transition(STATES.SERVICE_STOPPING);
  m.transition(STATES.SERVICE_STARTING);
  m.transition(STATES.HEALTH_CHECKING);
  m.transition(STATES.COMPLETED);
  assert.equal(m.state, STATES.COMPLETED);
  assert.equal(m.snapshot().nextVersion, '1.0.18');
  assert.ok(seen.includes('downloading') && seen.includes('completed'));
});

test('rejects an illegal transition (install before download)', () => {
  const m = new UpdaterStateMachine();
  m.transition(STATES.CHECKING);
  m.transition(STATES.UPDATE_AVAILABLE);
  assert.throws(() => m.transition(STATES.INSTALLING), /illegal transition/);
});

test('rejects an unknown state', () => {
  const m = new UpdaterStateMachine();
  assert.throws(() => m.transition('banana'), /unknown state/);
});

test('FAILED is reachable from active states and can reset', () => {
  const m = new UpdaterStateMachine();
  m.transition(STATES.CHECKING);
  m.transition(STATES.FAILED, { error: 'boom' });
  assert.equal(m.snapshot().error, 'boom');
  m.reset();
  assert.equal(m.state, STATES.IDLE);
  assert.equal(m.snapshot().error, null);
});

test('patch updates nested download telemetry without changing state', () => {
  const m = new UpdaterStateMachine();
  m.transition(STATES.CHECKING);
  m.transition(STATES.UPDATE_AVAILABLE);
  m.transition(STATES.DOWNLOADING);
  m.patch({ progressPercent: 42, download: { bytesPerSecond: 1000, mode: 'differential' } });
  const s = m.snapshot();
  assert.equal(s.state, 'downloading');
  assert.equal(s.progressPercent, 42);
  assert.equal(s.download.bytesPerSecond, 1000);
  assert.equal(s.download.mode, 'differential');
});
