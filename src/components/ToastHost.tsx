import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { TOAST_EVENT, type ToastPayload } from '../lib/notificationUtils';

const TOAST_LIFETIME_MS = 6000;
const MAX_VISIBLE_TOASTS = 3;

const TONE_STYLES: Record<NonNullable<ToastPayload['tone']>, { icon: React.ElementType; iconClass: string }> = {
  info: { icon: Bell, iconClass: 'bg-brand-50 text-brand-700' },
  success: { icon: CheckCircle2, iconClass: 'bg-brand-50 text-brand-700' },
  warning: { icon: AlertTriangle, iconClass: 'bg-amber-50 text-amber-700' },
};

/**
 * Renders in-app toasts dispatched through showToast()/showNotification().
 * This is the channel that always works: no login, no permission prompt,
 * and it works on iOS Safari where the Notification API is unavailable.
 */
const ToastHost: React.FC = () => {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const remove = (id: string) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
    };

    const onToast = (event: Event) => {
      const toast = (event as CustomEvent<ToastPayload>).detail;
      if (!toast) return;
      setToasts((prev) => [toast, ...prev].slice(0, MAX_VISIBLE_TOASTS));
      timers.set(toast.id, setTimeout(() => remove(toast.id), TOAST_LIFETIME_MS));
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3"
    >
      {toasts.map((toast) => {
        const tone = TONE_STYLES[toast.tone ?? 'info'];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-xl animate-slide-up"
          >
            <button
              type="button"
              onClick={() => {
                dismiss(toast.id);
                if (toast.href) navigate(toast.href);
              }}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
            >
              <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tone.iconClass}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">{toast.title}</span>
                <span className="block text-xs text-gray-600">{toast.body}</span>
                {toast.href && <span className="mt-1 block text-xs font-semibold text-brand-700">View order</span>}
              </span>
            </button>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastHost;
