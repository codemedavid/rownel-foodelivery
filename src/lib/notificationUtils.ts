/**
 * Customer/staff notification plumbing for the browser.
 *
 * Every notification goes through three channels so it reaches the customer
 * regardless of login state or browser support:
 *   1. an in-app toast (dispatched as TOAST_EVENT; rendered by <ToastHost/>),
 *   2. a short sound,
 *   3. a system Notification when the user granted permission.
 */

export const TOAST_EVENT = 'rownel:toast';
const TOAST_DEDUPE_WINDOW_MS = 1500;

export interface ToastPayload {
  id: string;
  title: string;
  body: string;
  /** Deep link the toast opens when tapped (e.g. /track/<orderId>). */
  href?: string;
  tone?: 'info' | 'success' | 'warning';
}

let _audio: HTMLAudioElement | null = null;
let _lastToastKey = '';
let _lastToastAt = 0;

function playSound() {
  try {
    if (!_audio) {
      _audio = new Audio('/sounds/new-order.mp3');
      _audio.volume = 0.7;
    }
    _audio.currentTime = 0;
    _audio.play().catch(() => {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.stop(ctx.currentTime + 0.5);
      } catch { /* silent */ }
    });
  } catch { /* silent */ }
}

function toneFor(title: string): ToastPayload['tone'] {
  if (/cancel/i.test(title)) return 'warning';
  if (/deliver|confirm|ready/i.test(title)) return 'success';
  return 'info';
}

/** Show an in-app toast (no sound, no system notification). */
export function showToast(title: string, body: string, options: { href?: string; tone?: ToastPayload['tone'] } = {}) {
  const key = `${title}|${body}|${options.href ?? ''}`;
  const now = Date.now();
  if (key === _lastToastKey && now - _lastToastAt < TOAST_DEDUPE_WINDOW_MS) return;
  _lastToastKey = key;
  _lastToastAt = now;

  const payload: ToastPayload = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    href: options.href,
    tone: options.tone ?? toneFor(title),
  };
  try {
    window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
  } catch { /* non-browser environment */ }
}

export function showNotification(title: string, body: string, options: { href?: string } = {}) {
  showToast(title, body, options);
  playSound();
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, { body, icon: '/app-icon.png', tag: options.href ?? title });
      if (options.href) {
        notification.onclick = () => {
          window.focus();
          window.location.assign(options.href as string);
        };
      }
    } catch { /* some browsers throw without a service worker */ }
  }
}

/**
 * Ask for system-notification permission. Must be called from a user gesture
 * on most browsers. Resolves to the resulting permission.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
