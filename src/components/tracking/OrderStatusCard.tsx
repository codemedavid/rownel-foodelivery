import React from 'react';
import { Clock, CheckCircle2, ChefHat, Package, Bike, XCircle, ShoppingBag } from 'lucide-react';
import type { Order } from '../../lib/deliveryTypes';
import { STATUS_LABELS } from '../../lib/orderStatus';

const DELIVERY_STEPS = [
  { key: 'pending', label: 'Placed', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Package },
  { key: 'out_for_delivery', label: 'On the way', icon: Bike },
  { key: 'completed', label: 'Delivered', icon: CheckCircle2 },
] as const;

const PICKUP_STEPS = [
  { key: 'pending', label: 'Placed', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready for pick-up', icon: ShoppingBag },
  { key: 'completed', label: 'Picked up', icon: CheckCircle2 },
] as const;

const HEADLINES: Record<string, { title: string; body: string }> = {
  pending: { title: 'Waiting for the store', body: 'The store will confirm your order shortly.' },
  confirmed: { title: 'Order confirmed', body: 'The store accepted your order.' },
  preparing: { title: 'Preparing your order', body: 'Your food is being made right now.' },
  ready: { title: 'Order is ready', body: 'Waiting for a rider to pick it up.' },
  out_for_delivery: { title: 'Rider on the way', body: 'Keep your phone nearby.' },
  completed: { title: 'Delivered', body: 'Enjoy your meal! Thanks for ordering.' },
  cancelled: { title: 'Order cancelled', body: 'Contact the store if this is unexpected.' },
};

/** Grab-style status header with a horizontal step tracker. */
const OrderStatusCard: React.FC<{ order: Order; isLive: boolean }> = ({ order, isLive }) => {
  const isPickup = order.serviceType === 'pickup';
  const steps = isPickup ? PICKUP_STEPS : DELIVERY_STEPS;
  const currentIndex = steps.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const headline = HEADLINES[order.status] ?? { title: STATUS_LABELS[order.status] ?? order.status, body: '' };
  const readyBody = isPickup && order.status === 'ready' ? 'Head to the store to pick it up.' : headline.body;

  return (
    <section className={`rounded-2xl p-5 text-white shadow-sm ${isCancelled ? 'bg-gray-700' : 'bg-brand-600'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Order #{order.id.slice(0, 8).toUpperCase()}</p>
          <h2 className="mt-1 text-2xl font-bold leading-tight">{headline.title}</h2>
          <p className="mt-1 text-sm text-white/90">{readyBody}</p>
        </div>
        {isCancelled ? (
          <XCircle className="h-8 w-8 flex-shrink-0 text-white/80" />
        ) : (
          <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${isLive ? 'bg-white/20' : 'bg-white/10'}`}>
            <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-white animate-pulse' : 'bg-white/50'}`} />
            {isLive ? 'Live' : 'Updating'}
          </span>
        )}
      </div>

      {!isCancelled && (
        <ol className="mt-5 flex items-start justify-between gap-1">
          {steps.map((step, index) => {
            const done = index <= currentIndex;
            const current = index === currentIndex;
            const Icon = step.icon;
            return (
              <li key={step.key} className="flex flex-1 flex-col items-center text-center">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${index === 0 ? 'bg-transparent' : done ? 'bg-white' : 'bg-white/30'}`} />
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                      current ? 'bg-white text-brand-700 ring-4 ring-white/30' : done ? 'bg-white text-brand-700' : 'bg-white/20 text-white/60'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`h-0.5 flex-1 ${index === steps.length - 1 ? 'bg-transparent' : index < currentIndex ? 'bg-white' : 'bg-white/30'}`} />
                </div>
                <span className={`mt-1.5 text-[10px] font-medium leading-tight ${done ? 'text-white' : 'text-white/60'}`}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};

export default OrderStatusCard;
