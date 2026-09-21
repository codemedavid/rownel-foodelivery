import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import AddressAutocompleteInput from '../AddressAutocompleteInput';
import MapLocationPicker from '../MapLocationPicker';
import { isWithinPhilippines, type AddressSuggestion } from '../../lib/geocoding';
import { PrimaryButton, Sheet } from '../ui';

export interface DeliveryAddress {
  address: string;
  latitude: number;
  longitude: number;
}

interface DeliveryAddressSheetProps {
  open: boolean;
  initial: DeliveryAddress | null;
  onClose: () => void;
  onSave: (address: DeliveryAddress) => void;
}

/** Edit the drop-off: search an address, then fine-tune the pin on the map. */
const DeliveryAddressSheet: React.FC<DeliveryAddressSheetProps> = ({ open, initial, onClose, onSave }) => {
  const [text, setText] = useState('');
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initial?.address ?? '');
    setPoint(initial ? { latitude: initial.latitude, longitude: initial.longitude } : null);
    setError(null);
  }, [open, initial]);

  const acceptPoint = (latitude: number, longitude: number, address: string) => {
    if (!isWithinPhilippines(latitude, longitude)) {
      setError('We only deliver within the Philippines.');
      setPoint(null);
      return;
    }
    setError(null);
    setPoint({ latitude, longitude });
    setText(address);
  };

  const handleSuggestion = (suggestion: AddressSuggestion) => {
    if (suggestion.countryCode && suggestion.countryCode !== 'ph' && !isWithinPhilippines(suggestion.latitude, suggestion.longitude)) {
      setError('We only deliver within the Philippines.');
      setPoint(null);
      return;
    }
    acceptPoint(suggestion.latitude, suggestion.longitude, suggestion.displayName);
  };

  const save = () => {
    if (!text.trim()) {
      setError('Enter your delivery address.');
      return;
    }
    if (!point) {
      setError('Pick a suggestion or drop the pin so the rider can find you.');
      return;
    }
    onSave({ address: text.trim(), latitude: point.latitude, longitude: point.longitude });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Delivery address">
      <AddressAutocompleteInput
        label=""
        value={text}
        rows={2}
        placeholder="House no., street, barangay, city"
        proximity={point}
        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/20"
        onChange={(value) => {
          setText(value);
          setError(null);
        }}
        onSelect={handleSuggestion}
        onClearSelection={() => undefined}
      />
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
        <MapLocationPicker
          latitude={point?.latitude ?? null}
          longitude={point?.longitude ?? null}
          onLocationSelect={(lat, lng, address) => acceptPoint(lat, lng, address)}
          showSearch={false}
          showGpsButton
          height="240px"
          zoom={16}
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">Drag the pin to your door, or use GPS. You can keep your typed address.</p>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" /> {error}
        </p>
      )}
      <div className="mt-4">
        <PrimaryButton onClick={save}>Use this address</PrimaryButton>
      </div>
    </Sheet>
  );
};

export default DeliveryAddressSheet;
