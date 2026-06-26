/**
 * Native file dialogs (Electron) for open/save, with a browser fallback.
 *
 * Wraps the preload `electronAPI` dialog + file IO so pages don't talk to
 * Electron directly. Outside Electron, `saveFile` falls back to a blob download
 * and `openFile` reports `unsupported`.
 */
export function useNativeFile() {
  const electron = typeof window !== 'undefined' ? window.electronAPI : null;
  const isElectron = !!electron?.showSaveDialog;

  /**
   * Save `data` (string/Buffer-like) to a user-chosen path.
   * @returns {Promise<{ canceled: boolean, filePath?: string }>}
   */
  async function saveFile({ data, defaultPath, filters } = {}) {
    if (isElectron) {
      const res = await electron.showSaveDialog({ defaultPath, filters });
      if (res?.canceled || !res?.filePath) return { canceled: true };
      await electron.saveFile(res.filePath, data);
      return { canceled: false, filePath: res.filePath };
    }
    // Web fallback — trigger a download.
    const blob = data instanceof Blob ? data : new Blob([data ?? '']);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultPath || 'export';
    a.click();
    URL.revokeObjectURL(url);
    return { canceled: false };
  }

  /**
   * Pick and read a file.
   * @returns {Promise<{ canceled: boolean, filePath?: string, content?: any, unsupported?: boolean }>}
   */
  async function openFile({ filters } = {}) {
    if (!isElectron) return { canceled: true, unsupported: true };
    const res = await electron.showOpenDialog({ filters, properties: ['openFile'] });
    if (res?.canceled || !res?.filePaths?.length) return { canceled: true };
    const content = await electron.readFile(res.filePaths[0]);
    return { canceled: false, filePath: res.filePaths[0], content };
  }

  return { isElectron, saveFile, openFile };
}
