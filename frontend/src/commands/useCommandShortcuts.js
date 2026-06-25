import { onMounted, onUnmounted } from 'vue';
import { useCommands } from './useCommands.js';

/**
 * Global keyboard-shortcut engine for the command system.
 *
 * Binds a single keydown listener and routes matching key combos to
 * `execute(id)` — so a shortcut runs the exact same code path as clicking the
 * command in the bar / palette / context menu (no duplicated handlers). Only
 * currently-visible commands can fire, and `runCommand` re-checks enabled state.
 *
 * Reserved combos owned by other layers are skipped to avoid double handling:
 *   - ctrl+k  → command palette (useKeyboardShortcuts → QuickSearch)
 *   - escape  → dialog close (useKeyboardShortcuts)
 *
 * Mount once, in the desktop shell.
 */
const RESERVED = new Set(['ctrl+k', 'escape']);

const normalizeShortcut = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('cmd', 'ctrl')
    .replace('command', 'ctrl')
    .replace('meta', 'ctrl')
    // canonical modifier order: ctrl, shift, alt
    .split('+')
    .filter(Boolean)
    .sort((a, b) => {
      const order = { ctrl: 0, shift: 1, alt: 2 };
      return (order[a] ?? 9) - (order[b] ?? 9);
    })
    .join('+');

/** Physical-key name from the event (layout-independent, mirrors useKeyboardShortcuts). */
const keyFromEvent = (e) => {
  const code = e.code || '';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `numpad${code.slice(6).toLowerCase()}`;
  const special = {
    Escape: 'escape',
    Enter: 'enter',
    Space: 'space',
    Delete: 'delete',
    Insert: 'insert',
  };
  if (special[code]) return special[code];
  if (/^F\d{1,2}$/.test(e.key)) return e.key.toLowerCase(); // F1..F12
  return (e.key || '').toLowerCase();
};

const comboFromEvent = (e) => {
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  const key = keyFromEvent(e);
  return normalizeShortcut([...mods, key].join('+'));
};

const isTypingTarget = (el) =>
  !!el &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true ||
    el.tagName === 'SELECT');

export function useCommandShortcuts() {
  const { visibleCommands, execute } = useCommands();

  const onKeydown = (e) => {
    const combo = comboFromEvent(e);
    if (!combo || RESERVED.has(combo)) return;

    // Bare single-key shortcuts (no modifier) must not fire while typing.
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
    if (!hasModifier && isTypingTarget(e.target)) return;

    const match = visibleCommands.value.find(
      (c) => c.shortcut && normalizeShortcut(c.shortcut) === combo
    );
    if (!match) return;

    e.preventDefault();
    execute(match.id);
  };

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
