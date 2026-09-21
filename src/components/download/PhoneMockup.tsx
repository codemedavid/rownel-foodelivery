import React from 'react';
import { ChevronDown, MapPin, Search, Star } from 'lucide-react';
import { SERVICES } from '../../lib/services';

const PREVIEW_SERVICES = SERVICES.slice(0, 4);

const PREVIEW_MERCHANTS = [
  { name: "Cj's Foodies Corner", meta: 'Takoyaki · 1.2 km', rating: '4.8', emoji: '🐙' },
  { name: 'B1T1 Coffee', meta: 'Café · 2.4 km', rating: '4.7', emoji: '☕' },
  { name: 'Sweet Tooth Bangar', meta: 'Bakery · 3.1 km', rating: '4.9', emoji: '🧁' },
] as const;

/**
 * A miniature of the real customer home screen, built in CSS so it never goes
 * stale against a screenshot and costs no image bytes.
 */
const PhoneMockup: React.FC = () => (
  <div
    aria-hidden="true"
    className="relative mx-auto w-[260px] select-none rounded-[2.5rem] border-[10px] border-[#0b1a12] bg-[#0b1a12] shadow-2xl shadow-black/50 sm:w-[288px]"
  >
    <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#0b1a12]" />

    <div className="overflow-hidden rounded-[1.9rem] bg-gray-50">
      <div className="bg-brand-600 px-4 pb-7 pt-7 text-white">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[8px] font-medium uppercase tracking-wide text-white/80">Deliver to</span>
            <span className="flex items-center gap-1 text-[11px] font-bold">
              Balaoan, La Union
              <ChevronDown className="h-3 w-3" />
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[10px] text-gray-400">Search food, stores, groceries</span>
        </div>
      </div>

      <div className="-mt-4 px-3">
        <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-white p-3 shadow-sm">
          {PREVIEW_SERVICES.map((service) => (
            <div key={service.id} className="flex flex-col items-center gap-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-base">
                {service.emoji}
              </span>
              <span className="text-[8px] font-semibold text-gray-700">{service.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-yellow-500 px-3 py-2.5">
          <span className="text-base">🛵</span>
          <span className="text-[9px] font-bold leading-tight text-yellow-900">
            Pasabay fixed fee
            <span className="block font-medium text-yellow-800">Budget delivery around town</span>
          </span>
        </div>

        <p className="mt-3 text-[10px] font-bold text-gray-900">Near you</p>

        <div className="mt-1.5 space-y-1.5 pb-3">
          {PREVIEW_MERCHANTS.map((merchant) => (
            <div key={merchant.name} className="flex items-center gap-2 rounded-xl bg-white p-2 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-base">
                {merchant.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[9.5px] font-bold text-gray-900">{merchant.name}</span>
                <span className="block text-[8px] text-gray-500">{merchant.meta}</span>
              </span>
              <span className="flex items-center gap-0.5 text-[8px] font-bold text-gray-700">
                <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                {merchant.rating}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-around border-t border-gray-200 bg-white py-2 text-[7.5px] font-medium">
        {['Home', 'Orders', 'Cart', 'Profile'].map((tab, index) => (
          <span key={tab} className={index === 0 ? 'text-brand-700' : 'text-gray-400'}>
            {tab}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export default PhoneMockup;
