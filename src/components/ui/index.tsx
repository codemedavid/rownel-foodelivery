import React from 'react';
import { Star, MapPin, Clock } from 'lucide-react';

export const formatPeso = (value: number): string =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDistance = (distanceKm?: number): string =>
  typeof distanceKm === 'number' ? `${distanceKm.toFixed(1)} km` : 'Nearby';

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}> = ({ title, subtitle, action }) => (
  <div className="mb-3 flex items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
    {action && (
      <button type="button" onClick={action.onClick} className="flex-shrink-0 text-sm font-semibold text-brand-700">
        {action.label}
      </button>
    )}
  </div>
);

export const Pill: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
      active ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300'
    }`}
  >
    {children}
  </button>
);

export const RatingBadge: React.FC<{ rating: number; reviews?: number }> = ({ rating, reviews }) => (
  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800">
    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
    {rating > 0 ? rating.toFixed(1) : 'New'}
    {typeof reviews === 'number' && reviews > 0 && <span className="font-normal text-gray-500">({reviews})</span>}
  </span>
);

export const MetaChip: React.FC<{ icon: 'distance' | 'time'; children: React.ReactNode }> = ({ icon, children }) => {
  const Icon = icon === 'distance' ? MapPin : Clock;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
};

export const EmptyState: React.FC<{ emoji: string; title: string; body?: string; action?: React.ReactNode }> = ({
  emoji,
  title,
  body,
  action,
}) => (
  <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center">
    <div className="text-4xl">{emoji}</div>
    <p className="mt-2 text-sm font-semibold text-gray-900">{title}</p>
    {body && <p className="mt-1 text-xs text-gray-500">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Spinner: React.FC<{ className?: string }> = ({ className = 'h-8 w-8' }) => (
  <div className={`${className} animate-spin rounded-full border-4 border-brand-600 border-t-transparent`} role="status" aria-label="Loading" />
);

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', children, ...props }) => (
  <button
    type="button"
    {...props}
    className={`w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 ${className}`}
  >
    {children}
  </button>
);

/** Bottom sheet used for quick actions on mobile; a centred dialog on desktop. */
export const Sheet: React.FC<{ open: boolean; onClose: () => void; title?: string; children: React.ReactNode }> = ({
  open,
  onClose,
  title,
  children,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl animate-slide-up safe-bottom sm:max-w-lg sm:rounded-3xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden" />
        {title && <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>}
        {children}
      </div>
    </div>
  );
};
