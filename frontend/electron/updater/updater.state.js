/**
 * updater.state.js
 *
 * A small, dependency-free finite-state machine for the update lifecycle.
 * It validates every transition against TRANSITIONS so an illegal sequence
 * (e.g. INSTALLING before DOWNLOADED) throws instead of silently corrupting
 * the flow. It also holds the live snapshot (versions, progress, telemetry,
 * error) and notifies a single subscriber (the orchestrator) on every change.
 *
 * Pure logic — unit-tested in __tests__/updater.state.test.mjs. No electron,
 * no fs, no timers.
 */

import { STATES, TRANSITIONS, DOWNLOAD_MODE } from './updater.events.js';

export class UpdaterStateMachine {
  /** @param {(snapshot: object) => void} [onChange] */
  constructor(onChange) {
    this._onChange = typeof onChange === 'function' ? onChange : () => {};
    this._state = STATES.IDLE;
    this._snapshot = {
      state: STATES.IDLE,
      currentVersion: '',
      nextVersion: '',
      releaseNotes: '',
      progressPercent: 0,
      download: {
        mode: DOWNLOAD_MODE.UNKNOWN,
        fallbackReason: '',
        fullSizeBytes: 0,
        transferredBytes: 0,
        bytesPerSecond: 0,
        etaSeconds: null,
        savedBytes: 0,
        pctSaved: 0,
      },
      error: null,
      appMode: 'server',
      source: 'github',
    };
  }

  get state() {
    return this._state;
  }

  /** Immutable-ish copy of the current snapshot for the renderer/IPC. */
  snapshot() {
    return { ...this._snapshot, download: { ...this._snapshot.download } };
  }

  /**
   * Whether `next` is a legal transition from the current state. Used by the
   * orchestrator to decide retry targets without throwing.
   */
  canTransition(next) {
    const allowed = TRANSITIONS[this._state] || [];
    return allowed.includes(next);
  }

  /**
   * Move to `next`, merging `patch` into the snapshot. Throws on an illegal
   * transition — that is always a bug in the orchestrator, never user input.
   *
   * @param {string} next   target state
   * @param {object} [patch] partial snapshot fields to merge
   * @returns {object} the new snapshot
   */
  transition(next, patch = {}) {
    if (!Object.values(STATES).includes(next)) {
      throw new Error(`UpdaterStateMachine: unknown state "${next}"`);
    }
    if (next !== this._state && !this.canTransition(next)) {
      throw new Error(
        `UpdaterStateMachine: illegal transition ${this._state} → ${next}`
      );
    }
    this._state = next;
    // Merge top-level fields; deep-merge the nested download telemetry.
    const { download, ...rest } = patch;
    this._snapshot = {
      ...this._snapshot,
      ...rest,
      state: next,
      download: { ...this._snapshot.download, ...(download || {}) },
    };
    this._onChange(this.snapshot());
    return this.snapshot();
  }

  /** Patch the snapshot WITHOUT changing state (e.g. progress ticks). */
  patch(patch = {}) {
    const { download, ...rest } = patch;
    this._snapshot = {
      ...this._snapshot,
      ...rest,
      state: this._state,
      download: { ...this._snapshot.download, ...(download || {}) },
    };
    this._onChange(this.snapshot());
    return this.snapshot();
  }

  /** Force the machine back to IDLE (after a terminal completed/failed). */
  reset() {
    this._state = STATES.IDLE;
    this._snapshot = { ...this._snapshot, state: STATES.IDLE, error: null, progressPercent: 0 };
    this._onChange(this.snapshot());
    return this.snapshot();
  }
}
