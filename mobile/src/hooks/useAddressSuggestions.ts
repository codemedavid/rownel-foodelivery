// Address autocomplete, debounced and cancelled per keystroke.
//
// The behaviour that matters is what happens when the lookup fails. A refused
// or unconfigured map service fails identically for every keystroke, so the
// hook stops asking — otherwise each letter the customer types fires another
// doomed request and repaints the same error. An outage or a dropped
// connection is different: it may well work on the next letter, so it does not
// latch.

import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import { suggestAddresses, type AddressCandidate, type ProximityPoint } from '../lib/geocoding';
import {
  describeGeocodingError,
  isAbortError,
  isGeocodingConfigError,
  logGeocodingError,
} from '../lib/geocodingError';

// Long enough that a normal typing speed sends one request per word, not per
// letter; short enough that the list feels live.
const DEBOUNCE_MS = 300;

// Below this a query matches most of the country and the results are noise.
const MIN_QUERY_LENGTH = 3;

export interface AddressSuggestionsState {
  candidates: AddressCandidate[];
  isLoading: boolean;
  /** Shown under the field. Empty when there is nothing to report. */
  errorMessage: string;
  /** True once the service has refused us: the field stops searching. */
  isUnavailable: boolean;
}

export const useAddressSuggestions = (
  query: string,
  proximity?: ProximityPoint | null
): AddressSuggestionsState => {
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isUnavailable, setIsUnavailable] = useState(false);

  // Read inside the effect but deliberately not a dependency: moving a few
  // metres should not re-run the search the customer is halfway through.
  const proximityRef = useRef(proximity);
  proximityRef.current = proximity;

  useEffect(() => {
    if (isUnavailable) return;

    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setCandidates([]);
      setIsLoading(false);
      setErrorMessage('');
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const run = async () => {
      try {
        const results = await suggestAddresses(debouncedQuery, {
          proximity: proximityRef.current,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        setCandidates(results);
        setErrorMessage('');
      } catch (error: unknown) {
        // A superseded request is not a failure and must not repaint the list.
        if (isAbortError(error) || controller.signal.aborted) return;

        logGeocodingError('address autocomplete', error);
        setCandidates([]);
        setErrorMessage(describeGeocodingError(error));

        // Nothing the customer types will fix this one.
        if (isGeocodingConfigError(error)) setIsUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void run();

    return () => controller.abort();
  }, [debouncedQuery, isUnavailable]);

  return { candidates, isLoading, errorMessage, isUnavailable };
};
