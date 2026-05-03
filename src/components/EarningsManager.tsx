import React, { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import {
  ArrowLeft, Wallet, TrendingUp, Clock, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, Plus, DollarSign,
  Calendar, Package, Loader2, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { RiderProfile, RiderSettings } from '../hooks/useRiderProfile';

interface Props {
  onBack: () => void;
}

function calcOrderEarning(
  deliveryFee: number,
  rider: RiderProfile,
  settings: RiderSettings | null
): number {
  const mode = rider.payment_mode ?? settings?.default_payment_mode ?? 'percentage';
  const value = rider.payment_value ?? settings?.default_payment_value ?? 0;
  if (mode === 'fixed') return value;
  return Math.round(deliveryFee * (value / 100) * 100) / 100;
}

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const EarningsManager: React.FC<Props> = ({ onBack }) => {
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  const [settings, setSettings] = useState<RiderSettings | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [loadingRiders, setLoadingRiders] = useState(true);
  const [showCreatePayout, setShowCreatePayout] = useState(false);
  const [expandedPayout, setExpandedPayout] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('riders').select('*').eq('is_approved', true).order('name'),
      supabase.from('rider_settings').select('*').eq('id', 1).maybeSingle(),
    ]).then(([r, s]) => {
      setRiders((r.data ?? []) as RiderProfile[]);
      setSettings((s.data ?? null) as RiderSettings | null);
      if (r.data?.length) setSelectedRiderId(r.data[0].id);
      setLoadingRiders(false);
    });
  }, []);

  const selectedRider = riders.find((r) => r.id === selectedRiderId) ?? null;

  const orders = useQuery(
    api.earnings.adminRiderOrders,
    selectedRiderId ? { riderId: selectedRiderId } : 'skip'
  ) ?? [];

  const payouts = useQuery(
    api.earnings.adminListPayouts,
    selectedRiderId ? { riderId: selectedRiderId } : 'skip'
  ) ?? [];

  const markPaid = useMutation(api.earnings.adminMarkPaid);
  const cancelPayout = useMutation(api.earnings.adminCancelPayout);

  const unpaidOrders = useMemo(
    () => orders.filter((o: any) => !o.payoutId),
    [orders]
  );

  const totalEarned = useMemo(
    () => orders.reduce((sum: number, o: any) => sum + (o.riderEarning ?? 0), 0),
    [orders]
  );

  const totalPaid = useMemo(
    () => (payouts as any[]).filter((p) => p.status === 'paid').reduce((sum: number, p: any) => sum + p.amount, 0),
    [payouts]
  );

  const pendingAmount = useMemo(
    () => (payouts as any[]).filter((p) => p.status === 'pending').reduce((sum: number, p: any) => sum + p.amount, 0),
    [payouts]
  );

  const unpaidEarnings = useMemo(() => {
    if (!selectedRider) return 0;
    return unpaidOrders.reduce(
      (sum: number, o: any) => sum + calcOrderEarning(o.deliveryFee ?? 0, selectedRider, settings),
      0
    );
  }, [unpaidOrders, selectedRider, settings]);

  if (loadingRiders) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Wallet className="h-5 w-5 text-red-600" />
          <h1 className="font-semibold text-black">Rider Earnings</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Rider selector */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 shrink-0">Rider</label>
          <select
            value={selectedRiderId}
            onChange={(e) => setSelectedRiderId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
          >
            {riders.map((r) => (
              <option key={r.id} value={r.id}>{r.name} — {r.plate_number}</option>
            ))}
          </select>
          {selectedRider && (
            <span className="text-xs text-gray-500">
              {selectedRider.payment_mode
                ? selectedRider.payment_mode === 'fixed'
                  ? `Fixed ₱${selectedRider.payment_value}`
                  : `${selectedRider.payment_value}% of fee`
                : settings
                  ? settings.default_payment_mode === 'fixed'
                    ? `Default: ₱${settings.default_payment_value}`
                    : `Default: ${settings.default_payment_value}% of fee`
                  : 'No payment config'}
            </span>
          )}
        </div>

        {selectedRider && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Earned" value={fmt(totalEarned)} icon={<TrendingUp className="h-4 w-4" />} color="green" />
              <StatCard label="Total Paid" value={fmt(totalPaid)} icon={<CheckCircle2 className="h-4 w-4" />} color="blue" />
              <StatCard label="Pending Payout" value={fmt(pendingAmount)} icon={<Clock className="h-4 w-4" />} color="amber" />
              <StatCard label="Unpaid Deliveries" value={fmt(unpaidEarnings)} icon={<Package className="h-4 w-4" />} color="red" sub={`${unpaidOrders.length} order${unpaidOrders.length !== 1 ? 's' : ''}`} />
            </div>

            {/* Unpaid orders */}
            <section className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-black">
                  Unpaid Deliveries ({unpaidOrders.length})
                </h2>
                {unpaidOrders.length > 0 && (
                  <button
                    onClick={() => setShowCreatePayout(true)}
                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create Payout
                  </button>
                )}
              </div>
              {unpaidOrders.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-500 text-sm">
                  All deliveries have been paid out.
                </div>
              ) : (
                <div className="divide-y">
                  {(unpaidOrders as any[]).map((order) => {
                    const earning = calcOrderEarning(order.deliveryFee ?? 0, selectedRider, settings);
                    return (
                      <div key={order._id} className="px-5 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-black truncate">{order.customerName}</p>
                          <p className="text-xs text-gray-500 truncate">{order.address ?? '—'}</p>
                          <p className="text-xs text-gray-400">{fmtDate(order.deliveredAt ?? order._creationTime)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Delivery fee: {fmt(order.deliveryFee ?? 0)}</p>
                          <p className="font-semibold text-green-700 text-sm">Earning: {fmt(earning)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total to pay out</span>
                    <span className="font-bold text-green-700">{fmt(unpaidEarnings)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Payout history */}
            <section className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold text-black">Payout History ({payouts.length})</h2>
              </div>
              {payouts.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-500 text-sm">No payouts yet.</div>
              ) : (
                <div className="divide-y">
                  {(payouts as any[]).map((payout) => (
                    <PayoutRow
                      key={payout._id}
                      payout={payout}
                      orders={orders as any[]}
                      rider={selectedRider}
                      settings={settings}
                      expanded={expandedPayout === payout._id}
                      onToggle={() => setExpandedPayout(expandedPayout === payout._id ? null : payout._id)}
                      onMarkPaid={() => markPaid({ payoutId: payout._id })}
                      onCancel={() => cancelPayout({ payoutId: payout._id })}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {showCreatePayout && selectedRider && (
        <CreatePayoutModal
          rider={selectedRider}
          settings={settings}
          orders={unpaidOrders as any[]}
          onClose={() => setShowCreatePayout(false)}
        />
      )}
    </div>
  );
};

// ─── Stat Card ───────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'green' | 'blue' | 'amber' | 'red';
  sub?: string;
}> = ({ label, value, icon, color, sub }) => {
  const colorMap = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="font-bold text-black text-base leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
};

// ─── Payout Row ───────────────────────────────────────────────────────────────
const PayoutRow: React.FC<{
  payout: any;
  orders: any[];
  rider: RiderProfile;
  settings: RiderSettings | null;
  expanded: boolean;
  onToggle: () => void;
  onMarkPaid: () => void;
  onCancel: () => void;
}> = ({ payout, orders, expanded, onToggle, onMarkPaid, onCancel }) => {
  const [busy, setBusy] = useState(false);

  const statusStyle =
    payout.status === 'paid'
      ? 'bg-green-100 text-green-700'
      : payout.status === 'cancelled'
        ? 'bg-gray-100 text-gray-500'
        : 'bg-amber-100 text-amber-700';

  const payoutOrders = orders.filter((o) => payout.orderIds?.includes(o._id));

  const handle = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 text-left"
      >
        <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-black">{fmt(payout.amount)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
              {payout.status}
            </span>
            {payout.notes && (
              <span className="text-xs text-gray-500 truncate">{payout.notes}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {fmtDate(payout.createdAt)}
            {payout.paidAt ? ` · Paid ${fmtDate(payout.paidAt)}` : ''}
            {' · '}{payout.orderIds?.length ?? 0} orders
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t bg-gray-50">
          {payoutOrders.length > 0 && (
            <div className="pt-3 space-y-1">
              {payoutOrders.map((o) => (
                <div key={o._id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{o.customerName}</span>
                  <span className="font-medium text-gray-900 shrink-0 ml-4">{fmt(o.riderEarning ?? 0)}</span>
                </div>
              ))}
            </div>
          )}

          {payout.status === 'pending' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handle(onMarkPaid)}
                disabled={busy}
                className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Mark as Paid
              </button>
              <button
                onClick={() => handle(onCancel)}
                disabled={busy}
                className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Create Payout Modal ──────────────────────────────────────────────────────
const CreatePayoutModal: React.FC<{
  rider: RiderProfile;
  settings: RiderSettings | null;
  orders: any[];
  onClose: () => void;
}> = ({ rider, settings, orders, onClose }) => {
  const createPayout = useMutation(api.earnings.adminCreatePayout);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(orders.map((o) => o._id))
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedOrders = orders.filter((o) => selectedIds.has(o._id));
  const totalAmount = selectedOrders.reduce(
    (sum, o) => sum + calcOrderEarning(o.deliveryFee ?? 0, rider, settings),
    0
  );

  const submit = async () => {
    if (selectedIds.size === 0) { setError('Select at least one order.'); return; }
    setSubmitting(true); setError('');
    try {
      await createPayout({
        riderId: rider.id,
        amount: Math.round(totalAmount * 100) / 100,
        notes: notes.trim() || undefined,
        periodFrom: Math.min(...selectedOrders.map((o) => o.deliveredAt ?? o._creationTime)),
        periodTo: Math.max(...selectedOrders.map((o) => o.deliveredAt ?? o._creationTime)),
        orderIds: selectedOrders.map((o) => o._id as Id<'orders'>),
        orderEarnings: selectedOrders.map((o) => ({
          orderId: o._id as Id<'orders'>,
          earning: calcOrderEarning(o.deliveryFee ?? 0, rider, settings),
        })),
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create payout');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-black">Create Payout — {rider.name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <XCircle className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Select orders to include</p>
              <button
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === orders.length
                      ? new Set()
                      : new Set(orders.map((o) => o._id))
                  )
                }
                className="text-xs text-red-600 hover:underline"
              >
                {selectedIds.size === orders.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {orders.map((order) => {
                const earning = calcOrderEarning(order.deliveryFee ?? 0, rider, settings);
                const checked = selectedIds.has(order._id);
                return (
                  <label
                    key={order._id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                      checked ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(order._id)}
                      className="accent-red-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black truncate">{order.customerName}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(order.deliveredAt ?? order._creationTime)}
                        {' · '}fee: {fmt(order.deliveryFee ?? 0)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-700 shrink-0">{fmt(earning)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. GCash ref #12345"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total payout</p>
              <p className="font-bold text-xl text-black">{fmt(totalAmount)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{selectedIds.size} orders</p>
              <p className="text-xs text-gray-500">
                {selectedOrders.length > 0
                  ? `${fmtDate(Math.min(...selectedOrders.map((o) => o.deliveredAt ?? o._creationTime)))} – ${fmtDate(Math.max(...selectedOrders.map((o) => o.deliveredAt ?? o._creationTime)))}`
                  : ''}
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || selectedIds.size === 0}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Creating…' : `Create Payout ${fmt(totalAmount)}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EarningsManager;
