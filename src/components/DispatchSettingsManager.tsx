import React, { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { ArrowLeft, Save, Bike } from 'lucide-react';
import { api } from '../../convex/_generated/api';

interface Props {
  onBack: () => void;
}

const DispatchSettingsManager: React.FC<Props> = ({ onBack }) => {
  const settings = useQuery(api.dispatchSettings.get, {});
  const update = useMutation(api.dispatchSettings.update);

  const [radiusKm, setRadiusKm] = useState(5);
  const [expirySec, setExpirySec] = useState(30);
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [staleSec, setStaleSec] = useState(120);
  const [dispatchOnCreate, setDispatchOnCreate] = useState(true);
  const [maxBatchOrders, setMaxBatchOrders] = useState(3);
  const [batchWindowSec, setBatchWindowSec] = useState(600);
  const [batchProximityKm, setBatchProximityKm] = useState(2.0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!settings) return;
    setRadiusKm(settings.offerRadiusKm);
    setExpirySec(Math.round(settings.offerExpiryMs / 1000));
    setMaxConcurrent(settings.maxConcurrentOffers);
    setStaleSec(Math.round(settings.locationStaleMs / 1000));
    setDispatchOnCreate(settings.dispatchOnCreate);
    setMaxBatchOrders(settings.maxConcurrentOrdersPerRider);
    setBatchWindowSec(Math.round(settings.batchTimeWindowMs / 1000));
    setBatchProximityKm(settings.batchProximityKm);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await update({
        offerRadiusKm: Number(radiusKm),
        offerExpiryMs: Math.round(Number(expirySec) * 1000),
        maxConcurrentOffers: Math.round(Number(maxConcurrent)),
        locationStaleMs: Math.round(Number(staleSec) * 1000),
        dispatchOnCreate,
        maxConcurrentOrdersPerRider: Math.round(Number(maxBatchOrders)),
        batchTimeWindowMs: Math.round(Number(batchWindowSec) * 1000),
        batchProximityKm: Number(batchProximityKm),
      });
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Bike className="h-6 w-6 text-red-600" />
          <h1 className="text-xl font-semibold text-gray-900">Dispatch Settings</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">Auto-Assignment</h2>
            <p className="text-sm text-gray-500">
              When a customer places a delivery order, we offer it to the closest available rider
              and fall through to the next nearest if they don't accept in time.
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900 text-sm">Dispatch on order creation</p>
              <p className="text-xs text-gray-500">
                If off, dispatch only fires when staff marks an order ready.
              </p>
            </div>
            <input
              type="checkbox"
              checked={dispatchOnCreate}
              onChange={(e) => setDispatchOnCreate(e.target.checked)}
              className="h-5 w-5 accent-red-600"
            />
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search radius (km)
            </label>
            <input
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum distance from the merchant to consider a rider.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Offer timeout (seconds)
            </label>
            <input
              type="number"
              min={5}
              max={600}
              value={expirySec}
              onChange={(e) => setExpirySec(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              How long a rider has to accept before we offer to the next one.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max concurrent offers
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of nearest riders to offer in each round (set to 1 for strict one-at-a-time).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location freshness (seconds)
            </label>
            <input
              type="number"
              min={30}
              max={1800}
              value={staleSec}
              onChange={(e) => setStaleSec(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Skip riders whose last location update is older than this.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">Order Batching</h2>
            <p className="text-sm text-gray-500">
              Riders can accept multiple economy orders when pickups are recent, same merchant, or nearby.
              Priority orders across merchants always require a free rider.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max orders per rider
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxBatchOrders}
              onChange={(e) => setMaxBatchOrders(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              How many simultaneous orders a rider may carry (set to 1 to disable batching).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch time window (seconds)
            </label>
            <input
              type="number"
              min={60}
              max={1800}
              value={batchWindowSec}
              onChange={(e) => setBatchWindowSec(parseInt(e.target.value) || 60)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              A new order can only batch onto a rider whose last accepted order was within this window.
              Default 600 s (10 min).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Merchant proximity threshold (km)
            </label>
            <input
              type="number"
              min={0.1}
              max={20}
              step={0.1}
              value={batchProximityKm}
              onChange={(e) => setBatchProximityKm(parseFloat(e.target.value) || 0.1)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              If merchants are within this distance, a rider can batch even if they're different merchants.
              Default 2 km.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {savedAt && (
              <p className="text-sm text-green-600">
                Saved {new Date(savedAt).toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !settings}
              className="ml-auto inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DispatchSettingsManager;
