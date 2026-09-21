import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { useUserLocation } from '../../contexts/LocationContext';
import AddressAutocompleteInput from '../AddressAutocompleteInput';
import MapLocationPicker from '../MapLocationPicker';
import type { AddressSuggestion } from '../../lib/geocoding';
import { PrimaryButton, Sheet } from '../ui';

interface LocationEditorSheetProps {
  open: boolean;
  onClose: () => void;
}

/** "Deliver to" editor: address search + draggable map pin + GPS shortcut. */
const LocationEditorSheet: React.FC<LocationEditorSheetProps> = ({ open, onClose }) => {
  const { userLocation, locationStatus, locationError, locationDisplayName, requestLocation, applyLocation, dismissManualPrompt } =
    useUserLocation();
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<AddressSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  // True only while a GPS request started inside the sheet is in flight — an
  // unrelated location resolution must not yank the sheet shut.
  const gpsFromSheetRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setInput(locationDisplayName || '');
    setSelected(null);
    setError(null);
    // Only reset when the sheet opens; the display name is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => {
    gpsFromSheetRef.current = false;
    dismissManualPrompt();
    onClose();
  }, [dismissManualPrompt, onClose]);

  useEffect(() => {
    if (locationStatus === 'ready' && gpsFromSheetRef.current) {
      gpsFromSheetRef.current = false;
      onClose();
    }
  }, [locationStatus, onClose]);

  const save = () => {
    if (!selected) {
      setError('Pick an address suggestion or drop the pin so we know exactly where to deliver.');
      return;
    }
    const street = selected.displayName.split(',')[0]?.trim() || selected.displayName;
    applyLocation(
      { latitude: selected.latitude, longitude: selected.longitude, displayName: selected.displayName, street },
      true
    );
    close();
  };

  return (
    <Sheet open={open} onClose={close} title="Deliver to">
      <AddressAutocompleteInput
        label=""
        value={input}
        rows={1}
        placeholder="Search street, building, or landmark"
        proximity={userLocation ?? null}
        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-600/20"
        onChange={(value) => {
          setInput(value);
          setError(null);
        }}
        onSelect={(suggestion) => {
          setSelected(suggestion);
          setError(null);
        }}
        onClearSelection={() => setSelected(null)}
      />

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
        <MapLocationPicker
          latitude={selected?.latitude ?? userLocation?.latitude ?? null}
          longitude={selected?.longitude ?? userLocation?.longitude ?? null}
          onLocationSelect={(lat, lng, address, placeId) => {
            setSelected({ placeId, displayName: address, latitude: lat, longitude: lng });
            setInput(address);
            setError(null);
          }}
          showSearch={false}
          showGpsButton={false}
          height="220px"
          zoom={15}
        />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">Drag the pin to your exact door.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {locationError && <p className="mt-2 text-xs text-amber-700">{locationError}</p>}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => {
            gpsFromSheetRef.current = true;
            requestLocation(false);
          }}
          disabled={locationStatus === 'locating'}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          <Navigation className="h-4 w-4 text-brand-600" />
          {locationStatus === 'locating' ? 'Locating…' : 'Use my current location'}
        </button>
        <PrimaryButton onClick={save}>Save location</PrimaryButton>
      </div>
    </Sheet>
  );
};

export default LocationEditorSheet;
