// Loads and authorises MapKit JS once per page.
//
// MapKit JS is a global singleton: the script may only be loaded once and
// `init` may only be called once, but several components (the address field,
// the location picker, the rider map) each need it and mount in any order. So
// every caller awaits the same promise rather than racing to initialise.
//
// There are two ways to authorise, and this supports both:
//
//   1. A token issued in the Apple developer dashboard, in VITE_MAPKIT_TOKEN.
//      Simplest to set up — no private key, no server — but it is long-lived and
//      ships in the browser bundle, so restrict it to this app's domains.
//   2. Otherwise /api/mapkit-token, which signs a 30-minute token per visitor.
//      The private key never leaves the server and MapKit refreshes through the
//      callback whenever a token nears expiry.
//
// Domain restriction is what protects either one: without it, a token lifted
// from the page spends this account's quota anywhere.

import { load, type MapKit } from '@apple/mapkit-loader';
import { GeocodingError } from '../geocodingError';

const TOKEN_ENDPOINT = '/api/mapkit-token';

// `services` covers Search and Geocoder; `full-map` covers the interactive map.
// Loading the rest would cost the customer bandwidth this app never uses.
const REQUIRED_LIBRARIES = ['services', 'full-map'];

const LANGUAGE = 'en';

// MapKit signals the end of initialisation through these two events on the
// namespace object; there is no promise-shaped alternative.
const READY_EVENT = 'configuration-change';
const FAILED_EVENT = 'error';

let mapkitPromise: Promise<MapKit> | null = null;

const fetchToken = async (): Promise<string> => {
  const response = await fetch(TOKEN_ENDPOINT, { headers: { Accept: 'text/plain' } });

  if (!response.ok) {
    throw new GeocodingError('auth', 'Could not get a Maps token', {
      status: response.status,
      detail: await response.text().catch(() => undefined),
    });
  }

  const token = (await response.text()).trim();
  if (!token) {
    throw new GeocodingError('auth', 'The Maps token endpoint returned an empty token');
  }
  return token;
};

const initialise = async (): Promise<MapKit> => {
  // A dashboard token is handed to the loader directly, which initialises
  // MapKit itself — there is nothing to wait for beyond the script loading.
  const staticToken = import.meta.env.VITE_MAPKIT_TOKEN?.trim();
  if (staticToken) {
    return load({ token: staticToken, libraries: REQUIRED_LIBRARIES, language: LANGUAGE });
  }

  const mapkit = await load({ libraries: REQUIRED_LIBRARIES, language: LANGUAGE });

  return new Promise<MapKit>((resolve, reject) => {
    const onReady = () => {
      cleanUp();
      resolve(mapkit);
    };
    const onFailure = () => {
      cleanUp();
      reject(new GeocodingError('auth', 'Apple Maps could not start'));
    };
    function cleanUp() {
      mapkit.removeEventListener(READY_EVENT, onReady);
      mapkit.removeEventListener(FAILED_EVENT, onFailure);
    }

    mapkit.addEventListener(READY_EVENT, onReady);
    mapkit.addEventListener(FAILED_EVENT, onFailure);

    mapkit.init({
      language: LANGUAGE,
      // MapKit hands us a `done` callback rather than awaiting a promise, so a
      // token failure has to be reported through the outer promise instead —
      // calling done() with a bad token would leave MapKit retrying forever.
      authorizationCallback: (done) => {
        fetchToken().then(done, (error: unknown) => {
          cleanUp();
          reject(error);
        });
      },
    });
  });
};

/**
 * Resolves with the initialised `mapkit` namespace. Safe to call from anywhere,
 * as often as needed. A failed attempt is not cached, so a component mounting
 * after a transient token outage can still recover.
 */
export const loadMapkit = (): Promise<MapKit> => {
  if (!mapkitPromise) {
    mapkitPromise = initialise().catch((error: unknown) => {
      mapkitPromise = null;
      throw error;
    });
  }
  return mapkitPromise;
};

/** Drops the cached namespace. Exists so tests start from a clean singleton. */
export const resetMapkitForTests = (): void => {
  mapkitPromise = null;
};
