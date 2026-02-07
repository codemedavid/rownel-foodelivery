import React, { useEffect, useRef, useState } from 'react';
import { searchAddresses, type OSMAddressSuggestion } from '../lib/osm';

interface AddressAutocompleteInputProps {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
  countryCodes?: string[];
  onChange: (value: string) => void;
  onSelect: (suggestion: OSMAddressSuggestion) => void;
  onClearSelection?: () => void;
}

const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
  label,
  value,
  required = false,
  placeholder,
  rows = 3,
  className = 'w-full px-4 py-3 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200',
  countryCodes,
  onChange,
  onSelect,
  onClearSelection,
}) => {
  const [suggestions, setSuggestions] = useState<OSMAddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedFromSuggestionRef = useRef(false);

  useEffect(() => {
    if (selectedFromSuggestionRef.current) {
      selectedFromSuggestionRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSearchError(null);
      return;
    }

    let isCancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setSearchError(null);
        const results = await searchAddresses(query, { countryCodes, limit: 5 });
        if (!isCancelled) {
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        }
      } catch {
        if (!isCancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
          setSearchError('Could not load suggestions. You can still enter your address manually.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, [countryCodes, value]);

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

  const handleSelectSuggestion = (suggestion: OSMAddressSuggestion) => {
    selectedFromSuggestionRef.current = true;
    onChange(suggestion.displayName);
    onSelect(suggestion);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError(null);
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

      {isLoading && (
        <p className="mt-2 text-xs text-gray-500">Searching OpenStreetMap addresses...</p>
      )}
      {searchError && <p className="mt-2 text-xs text-amber-700">{searchError}</p>}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-sm text-gray-800"
            >
              {suggestion.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocompleteInput;
