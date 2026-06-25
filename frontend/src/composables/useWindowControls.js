import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Thin wrapper over the Electron `window.electronAPI.windowControls` IPC bridge.
 *
 * Platform glue only — NO business logic. When the app runs in a plain browser
 * build (no Electron) `isElectron` is false and the custom title-bar buttons
 * simply don't render, so the page still works under the OS-drawn chrome.
 *
 * The native `close` keeps the existing main-process confirmation dialog
 * (electron/main/main.js → mainWindow.on('close')), so closing behaviour is
 * unchanged whether triggered by our button or the OS.
 */
const controls =
  typeof window !== 'undefined' && window.electronAPI ? window.electronAPI.windowControls : null;

export function useWindowControls() {
  const isElectron = !!controls;
  const isMaximized = ref(false);
  let cleanup = null;

  const minimize = () => controls?.minimize?.();
  const toggleMaximize = () => controls?.toggleMaximize?.();
  const close = () => controls?.close?.();

  const refreshMaximized = async () => {
    if (!controls?.isMaximized) return;
    try {
      isMaximized.value = await controls.isMaximized();
    } catch {
      /* noop — stay with the last known value */
    }
  };

  onMounted(() => {
    refreshMaximized();
    if (controls?.onMaximizeChange) {
      cleanup = controls.onMaximizeChange((value) => {
        isMaximized.value = value;
      });
    }
  });

  onUnmounted(() => {
    if (cleanup) cleanup();
  });

  return { isElectron, isMaximized, minimize, toggleMaximize, close };
}
