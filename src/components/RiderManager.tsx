import React, { useEffect, useState } from 'react';
import { useQuery, useAction } from 'convex/react';
import { ArrowLeft, Bike, MapPin, Check, X, Save, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../../convex/_generated/api';
import type { RiderProfile, RiderSettings } from '../hooks/useRiderProfile';

interface Props {
  onBack: () => void;
}

const RiderManager: React.FC<Props> = ({ onBack }) => {
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  const [settings, setSettings] = useState<RiderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'active' | 'settings'>('pending');
  const [showCreate, setShowCreate] = useState(false);
  const presence = useQuery(api.riders.listAvailable) ?? [];
  const presenceByUser = new Map(presence.map((p: any) => [p.supabaseUserId, p]));
  const setRiderRole = useAction(api.riderActions.adminSetRiderRole);

  const refresh = async () => {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase.from('riders').select('*').order('created_at', { ascending: false }),
      supabase.from('rider_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setRiders((r.data ?? []) as RiderProfile[]);
    setSettings((s.data ?? null) as RiderSettings | null);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const approve = async (rider: RiderProfile) => {
    await supabase.from('riders').update({ is_approved: true }).eq('id', rider.id);
    try {
      await setRiderRole({ userId: rider.id });
    } catch (e) {
      console.error('Could not set rider role in app_metadata:', e);
    }
    await refresh();
  };

  const setActive = async (rider: RiderProfile, isActive: boolean) => {
    await supabase.from('riders').update({ is_active: isActive }).eq('id', rider.id);
    await refresh();
  };

  const updatePayment = async (
    rider: RiderProfile,
    payment_mode: 'fixed' | 'percentage' | null,
    payment_value: number | null
  ) => {
    await supabase
      .from('riders')
      .update({ payment_mode, payment_value })
      .eq('id', rider.id);
    await refresh();
  };

  const pendingRiders = riders.filter((r) => !r.is_approved);
  const activeRiders = riders.filter((r) => r.is_approved);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Bike className="h-5 w-5 text-red-600" />
          <h1 className="font-semibold text-black">Rider Management</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="ml-auto bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm flex items-center gap-1"
          >
            <UserPlus className="h-4 w-4" /> Create rider
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-1 border-t">
          {(['pending', 'active', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                tab === t ? 'border-red-600 text-red-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t === 'pending' ? `Pending (${pendingRiders.length})` : t === 'active' ? `Active (${activeRiders.length})` : 'Platform Settings'}
            </button>
          ))}
        </div>
      </header>

      {showCreate && (
        <CreateRiderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void refresh(); }}
        />
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading && <p className="text-gray-500">Loading…</p>}

        {!loading && tab === 'pending' && (
          <div className="space-y-3">
            {pendingRiders.length === 0 && (
              <p className="text-gray-500 text-sm">No pending applications.</p>
            )}
            {pendingRiders.map((r) => (
              <div key={r.id} className="bg-white rounded-xl shadow-sm p-5 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-gray-600">{r.phone} • {r.plate_number} • {r.vehicle_type}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(r)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => setActive(r, false)}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'active' && (
          <div className="space-y-3">
            {activeRiders.length === 0 && <p className="text-gray-500 text-sm">No active riders.</p>}
            {activeRiders.map((r) => {
              const p = presenceByUser.get(r.id);
              const avg = r.rating_count > 0 ? r.rating_sum / r.rating_count : null;
              const online = p?.status === 'available' || p?.status === 'busy';
              return (
                <RiderRow
                  key={r.id}
                  rider={r}
                  online={online}
                  averageRating={avg}
                  onSetActive={(active) => setActive(r, active)}
                  onUpdatePayment={(mode, value) => updatePayment(r, mode, value)}
                />
              );
            })}
          </div>
        )}

        {!loading && tab === 'settings' && settings && (
          <PlatformSettings settings={settings} onSaved={refresh} />
        )}
      </main>
    </div>
  );
};

interface RiderRowProps {
  rider: RiderProfile;
  online: boolean;
  averageRating: number | null;
  onSetActive: (active: boolean) => void;
  onUpdatePayment: (mode: 'fixed' | 'percentage' | null, value: number | null) => void;
}

const RiderRow: React.FC<RiderRowProps> = ({ rider, online, averageRating, onSetActive, onUpdatePayment }) => {
  const [mode, setMode] = useState<'default' | 'fixed' | 'percentage'>(
    rider.payment_mode ?? 'default'
  );
  const [value, setValue] = useState(rider.payment_value?.toString() ?? '');

  const save = () => {
    if (mode === 'default') {
      onUpdatePayment(null, null);
    } else {
      const n = parseFloat(value);
      if (Number.isFinite(n) && n >= 0) onUpdatePayment(mode, n);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{rider.name}</p>
            {online && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <MapPin className="h-3 w-3" /> Online
              </span>
            )}
            {!rider.is_active && (
              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Deactivated</span>
            )}
          </div>
          <p className="text-sm text-gray-600">{rider.phone} • {rider.plate_number} • {rider.vehicle_type}</p>
          <p className="text-xs text-gray-500 mt-1">
            {averageRating ? `★ ${averageRating.toFixed(1)} (${rider.rating_count})` : 'No ratings yet'}
          </p>
        </div>
        <button
          onClick={() => onSetActive(!rider.is_active)}
          className={`px-3 py-1.5 text-sm rounded-lg ${
            rider.is_active ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {rider.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>

      <div className="border-t pt-3 flex items-center gap-2 flex-wrap">
        <label className="text-xs text-gray-600">Payment:</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value="default">Use platform default</option>
          <option value="fixed">Fixed (₱)</option>
          <option value="percentage">% of delivery fee</option>
        </select>
        {mode !== 'default' && (
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
            placeholder={mode === 'fixed' ? '₱' : '%'}
          />
        )}
        <button
          onClick={save}
          className="ml-auto text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 flex items-center gap-1"
        >
          <Save className="h-3 w-3" /> Save
        </button>
      </div>
    </div>
  );
};

const PlatformSettings: React.FC<{ settings: RiderSettings; onSaved: () => void }> = ({ settings, onSaved }) => {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await supabase.from('rider_settings').update(draft).eq('id', 1);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Default payment mode</label>
        <select
          value={draft.default_payment_mode}
          onChange={(e) => setDraft({ ...draft, default_payment_mode: e.target.value as any })}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="percentage">% of delivery fee</option>
          <option value="fixed">Fixed (₱)</option>
        </select>
      </div>
      <NumField label="Default payment value" value={draft.default_payment_value} onChange={(v) => setDraft({ ...draft, default_payment_value: v })} />
      <NumField label="Offer radius (km)" value={draft.offer_radius_km} onChange={(v) => setDraft({ ...draft, offer_radius_km: v })} />
      <NumField label="Offer expiry (seconds)" value={draft.offer_expiry_seconds} onChange={(v) => setDraft({ ...draft, offer_expiry_seconds: v })} />
      <NumField label="Max concurrent offers" value={draft.max_concurrent_offers} onChange={(v) => setDraft({ ...draft, max_concurrent_offers: v })} />
      <NumField label="Location stale threshold (seconds)" value={draft.location_stale_seconds} onChange={(v) => setDraft({ ...draft, location_stale_seconds: v })} />

      <button
        onClick={save}
        disabled={saving}
        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
      <p className="text-xs text-gray-500">
        Note: assignment radius and concurrency are also configured in <code>convex/offers.ts</code> constants — update both for full effect.
      </p>
    </div>
  );
};

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium mb-1">{label}</label>
    <input
      type="number"
      step="0.1"
      min="0"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full border border-gray-300 rounded px-3 py-2"
    />
  </div>
);

interface CreateRiderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateRiderModal: React.FC<CreateRiderModalProps> = ({ onClose, onCreated }) => {
  const create = useAction(api.riderActions.adminCreateRider);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    plateNumber: '',
    vehicleType: 'motorcycle' as 'motorcycle' | 'bicycle' | 'car',
    paymentMode: '' as '' | 'fixed' | 'percentage',
    paymentValue: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      await create({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone.trim(),
        plateNumber: form.plateNumber.trim(),
        vehicleType: form.vehicleType,
        paymentMode: form.paymentMode || undefined,
        paymentValue: form.paymentMode && form.paymentValue
          ? parseFloat(form.paymentValue)
          : undefined,
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create rider');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-black">Create new rider</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <Field label="Full name" value={form.name} onChange={(v) => update('name', v)} required />
          <Field label="Email" type="email" value={form.email} onChange={(v) => update('email', v)} required />
          <Field label="Password" type="password" value={form.password} onChange={(v) => update('password', v)} required minLength={6} />
          <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} required />
          <Field label="Plate number" value={form.plateNumber} onChange={(v) => update('plateNumber', v)} required />
          <div>
            <label className="block text-sm font-medium mb-1">Vehicle type</label>
            <select
              value={form.vehicleType}
              onChange={(e) => update('vehicleType', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="motorcycle">Motorcycle</option>
              <option value="bicycle">Bicycle</option>
              <option value="car">Car</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment override (optional)</label>
            <div className="flex gap-2">
              <select
                value={form.paymentMode}
                onChange={(e) => update('paymentMode', e.target.value)}
                className="border border-gray-300 rounded px-2 py-2 text-sm flex-1"
              >
                <option value="">Use platform default</option>
                <option value="fixed">Fixed (₱)</option>
                <option value="percentage">% of delivery fee</option>
              </select>
              {form.paymentMode && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.paymentValue}
                  onChange={(e) => update('paymentValue', e.target.value)}
                  placeholder={form.paymentMode === 'fixed' ? '₱' : '%'}
                  className="border border-gray-300 rounded px-2 py-2 text-sm w-24"
                />
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create rider'}
            </button>
          </div>
          <p className="text-xs text-gray-500 pt-1">
            The rider will be pre-approved and can sign in immediately with the email and password you set.
          </p>
        </form>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text', required, minLength }) => (
  <div>
    <label className="block text-sm font-medium mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      minLength={minLength}
      className="w-full border border-gray-300 rounded px-3 py-2"
    />
  </div>
);

export default RiderManager;
