let _audio: HTMLAudioElement | null = null;

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

export function showNotification(title: string, body: string) {
  playSound();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
