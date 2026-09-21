import React from 'react';
import { Bike, Zap, ShoppingBag, MapPin, ChevronRight, AlertTriangle } from 'lucide-react';
import type { PaymentMethod as PaymentMethodRecord } from '../../hooks/usePaymentMethods';
import { formatPeso } from '../ui';

export const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${className}`}>
    {title && <h2 className="mb-3 text-sm font-bold text-gray-900">{title}</h2>}
    {children}
  </section>
);

export const inputClass =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm placeholder-gray-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20';

export const FulfilmentToggle: React.FC<{
  value: 'delivery' | 'pickup';
  onChange: (value: 'delivery' | 'pickup') => void;
}> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
    {(
      [
        { id: 'delivery', label: 'Delivery', icon: Bike },
        { id: 'pickup', label: 'Pick-up', icon: ShoppingBag },
      ] as const
    ).map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={value === id}
        className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
          value === id ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-600'
        }`}
      >
        <Icon className="h-4 w-4" /> {label}
      </button>
    ))}
  </div>
);

export const AddressCard: React.FC<{ address: string | null; onEdit: () => void; error?: string | null }> = ({ address, onEdit, error }) => (
  <button
    type="button"
    onClick={onEdit}
    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
  >
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
      <MapPin className="h-5 w-5" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Deliver to</span>
      <span className={`block text-sm ${address ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{address || 'Add your delivery address'}</span>
      {error && <span className="mt-0.5 block text-xs text-red-600">{error}</span>}
    </span>
    <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400" />
  </button>
);

export const DeliveryModePicker: React.FC<{
  value: 'priority' | 'economy';
  priorityFee: number;
  economyFee: number;
  hasEconomy: boolean;
  onChange: (mode: 'priority' | 'economy') => void;
}> = ({ value, priorityFee, economyFee, hasEconomy, onChange }) => {
  const options = [
    { id: 'priority' as const, label: 'Rush', eta: '30–45 min', fee: priorityFee, icon: Zap, enabled: true },
    { id: 'economy' as const, label: 'Pasabay', eta: '45–120 min · budget', fee: economyFee, icon: Bike, enabled: hasEconomy },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ id, label, eta, fee, icon: Icon, enabled }) => (
        <button
          key={id}
          type="button"
          disabled={!enabled}
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={`rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-40 ${
            value === id ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1.5 text-sm font-bold ${value === id ? 'text-brand-700' : 'text-gray-800'}`}>
              <Icon className="h-4 w-4" /> {label}
            </span>
            <span className="text-sm font-bold text-gray-900">{formatPeso(fee)}</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">{enabled ? eta : 'Not offered by these stores'}</p>
        </button>
      ))}
    </div>
  );
};

export const PaymentPicker: React.FC<{
  methods: PaymentMethodRecord[];
  value: string;
  amount: number;
  reference: string;
  onChange: (id: string) => void;
  onReferenceChange: (value: string) => void;
}> = ({ methods, value, amount, reference, onChange, onReferenceChange }) => {
  const selected = methods.find((m) => m.id === value);
  return (
    <div className="space-y-3">
      {methods.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4" /> No payment methods are configured yet. Please contact the store.
        </p>
      )}
      <div className="space-y-2">
        {methods.map((method) => (
          <button
            key={method.id}
            type="button"
            onClick={() => onChange(method.id)}
            aria-pressed={value === method.id}
            className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-3 text-left ${
              value === method.id ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white'
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${value === method.id ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`}>
              {value === method.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="text-sm font-semibold text-gray-900">{method.name}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[11px] text-gray-500">Send to</p>
                <p className="break-all font-mono text-sm font-semibold text-gray-900">{selected.account_number}</p>
                <p className="text-xs text-gray-600">{selected.account_name}</p>
              </div>
              <div className="inline-block rounded-lg border border-gray-200 bg-white px-3 py-1.5">
                <p className="text-[11px] text-gray-500">Amount to pay</p>
                <p className="text-base font-bold text-brand-700">{formatPeso(amount)}</p>
              </div>
            </div>
            {selected.qr_code_url && (
              <div className="flex-shrink-0 text-center">
                <img src={selected.qr_code_url} alt={`${selected.name} QR code`} className="h-24 w-24 rounded-xl border border-gray-200 object-cover" />
                <p className="mt-1 text-[11px] text-gray-500">Scan to pay</p>
              </div>
            )}
          </div>
          <input
            type="text"
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder="Payment reference no. (optional)"
            className={`${inputClass} mt-3 bg-white`}
          />
        </div>
      )}
    </div>
  );
};
