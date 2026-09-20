import React, { useEffect, useRef, useState } from 'react';
import {
  suggestAddresses,
  type AddressCandidate,
  type AddressSuggestion,
  type ProximityPoint,
} from '../lib/geocoding';
import {
  describeGeocodingError,
  isAbortError,
  isGeocodingConfigError,
  logGeocodingError,
} from '../lib/geocodingError';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;
const SUGGESTION_LIMIT = 10;

interface AddressAutocompleteInputProps {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Ranks nearby matches first — pass the pin or the customer's GPS fix. */
  proximity?: ProximityPoint | null;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  onClearSelection?: () => void;
}

const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
  label,
  value,
  required = false,
  placeholder,
  rows = 3,
  className = 'w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200',
  proximity,
  onChange,
  onSelect,
  onClearSelection,
}) => {
  const [suggestions, setSuggestions] = useState<AddressCandidate[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedFromSuggestionRef = useRef(false);

  // Refused authorisation fails identically for every query, so once it happens
  // the search stops rather than firing a doomed request per keystroke. Typing
  // stays enabled throughout — a manually typed address still gets delivered.
  const isSearchUnavailableRef = useRef(false);

  // Depend on the primitives, not the object: callers pass an inline literal,
  // which would otherwise restart the debounce timer on every parent render.
  const proximityLat = proximity?.latitude ?? null;
  const proximityLng = proximity?.longitude ?? null;

  useEffect(() => {
    if (selectedFromSuggestionRef.current) {
      selectedFromSuggestionRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearchError(null);
      return;
    }

    if (isSearchUnavailableRef.current) return;

    const controller = new AbortController();
    let isCancelled = false;

    const timeout = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setSearchError(null);
        const results = await suggestAddresses(query, {
          limit: SUGGESTION_LIMIT,
          proximity:
            proximityLat === null || proximityLng === null
              ? null
              : { latitude: proximityLat, longitude: proximityLng },
          signal: controller.signal,
        });
        if (!isCancelled) {
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        }
      } catch (error: unknown) {
        // An abort means a newer keystroke replaced this request; the customer
        // has nothing to act on, and its result is already obsolete.
        if (isAbortError(error)) return;

        logGeocodingError('address suggestions', error);
        if (isGeocodingConfigError(error)) {
          isSearchUnavailableRef.current = true;
        }
        if (!isCancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
          setSearchError(describeGeocodingError(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [proximityLat, proximityLng, value]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  // MapKit returns the coordinate with the suggestion, so a pick resolves the
  // pin immediately — there is no second lookup to wait on.
  const handleSelectSuggestion = (candidate: AddressCandidate) => {
    selectedFromSuggestionRef.current = true;
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError(null);
    onChange(candidate.displayName);
    onSelect(candidate);
  };

  const handleInputChange = (nextValue: string) => {
    onChange(nextValue);
    onClearSelection?.();
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-black mb-2">
        {label}
        {required ? ' *' : ''}
      </label>
      <textarea
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        rows={rows}
        required={required}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
      />

      {isLoading && <p className="mt-2 text-xs text-gray-500">Searching places...</p>}
      {searchError && <p className="mt-2 text-xs text-amber-700">{searchError}</p>}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-[1000] mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId || suggestion.displayName}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-sm text-gray-800"
            >
              <span className="block font-medium text-gray-900">{suggestion.name}</span>
              {suggestion.context && (
                <span className="block text-xs text-gray-500">{suggestion.context}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocompleteInput;
