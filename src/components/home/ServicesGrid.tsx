import React, { useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { SERVICES, type ServiceDefinition, type ServiceId } from '../../lib/services';
import { useSiteSettings } from '../../hooks/useSiteSettings';
import { Sheet } from '../ui';

interface ServicesGridProps {
  activeService: ServiceId;
  onSelect: (service: ServiceDefinition) => void;
}

const buildMessengerLink = (url: string, template: string): string => {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('text', template);
    return parsed.toString();
  } catch {
    return url;
  }
};

/**
 * Top-level service hierarchy (Grab-style tiles). In-app services switch the
 * home feed and checkout defaults; contact services open a request sheet.
 */
const ServicesGrid: React.FC<ServicesGridProps> = ({ activeService, onSelect }) => {
  const { siteSettings } = useSiteSettings();
  const [contactService, setContactService] = useState<ServiceDefinition | null>(null);

  const handleSelect = (service: ServiceDefinition) => {
    if (service.kind === 'contact') {
      setContactService(service);
      return;
    }
    onSelect(service);
  };

  const contactNumber = siteSettings?.contact_number?.trim() || '';
  const messengerUrl = siteSettings?.messenger_url?.trim() || '';

  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {SERVICES.map((service) => {
          const isActive = service.kind === 'in-app' && service.id === activeService;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => handleSelect(service)}
              aria-pressed={isActive}
              className="group flex flex-col items-center gap-1.5 rounded-2xl py-2 text-center"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-sm transition-transform group-active:scale-95 ${
                  isActive ? 'bg-brand-600 ring-2 ring-brand-200' : 'bg-white ring-1 ring-gray-100'
                }`}
              >
                {service.emoji}
              </span>
              <span className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-brand-700' : 'text-gray-800'}`}>
                {service.name}
              </span>
            </button>
          );
        })}
      </div>

      <Sheet open={contactService !== null} onClose={() => setContactService(null)} title={contactService?.name}>
        {contactService && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
              <span className="text-3xl">{contactService.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{contactService.tagline}</p>
                <p className="text-xs text-gray-600">Tell us what you need and a Row-Nel rider takes care of it.</p>
              </div>
            </div>

            {contactService.requestTemplate && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">What to send us</p>
                <p className="mt-1 text-sm text-gray-700">{contactService.requestTemplate}</p>
              </div>
            )}

            {messengerUrl || contactNumber ? (
              <div className="space-y-2">
                {messengerUrl && (
                  <a
                    href={buildMessengerLink(messengerUrl, contactService.requestTemplate ?? '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    <MessageCircle className="h-4 w-4" /> Message us
                  </a>
                )}
                {contactNumber && (
                  <a
                    href={`tel:${contactNumber.replace(/\s/g, '')}`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    <Phone className="h-4 w-4" /> Call {contactNumber}
                  </a>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Requests for this service are handled over chat. Ask the Row-Nel team for their Messenger link or number —
                the admin can add it under Site Settings (messenger_url / contact_number).
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
};

export default ServicesGrid;
