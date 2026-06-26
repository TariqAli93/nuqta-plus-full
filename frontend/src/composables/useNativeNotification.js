/**
 * Native OS notifications, for events worth surfacing outside the app window
 * (e.g. a long export finished while the user is in another app). In Electron
 * the Web Notification API renders a real OS notification. Falls back silently
 * when unsupported/denied — callers should also show an in-app toast for
 * in-window feedback.
 */
export function useNativeNotification() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  async function notify(title, { body = '', silent = false } = {}) {
    if (!supported) return false;
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, silent });
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title, { body, silent });
          return true;
        }
      }
    } catch {
      /* notifications unavailable */
    }
    return false;
  }

  return { supported, notify };
}
