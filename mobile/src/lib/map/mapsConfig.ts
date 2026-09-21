// Where this app's maps and address lookups come from.
//
// Both are served by the Rownel web deployment rather than by Apple directly:
//
//   * The map is /map-embed.html on that origin, because a MapKit JS token is
//     pinned to a domain and only a page served from that domain can use it.
//   * Address search and reverse geocoding go through /api/maps-search and
//     /api/maps-reverse, so the Apple access token never lands on a phone.
//
// One origin covers both, which is why this is a single variable.

const ORIGIN_VARIABLE = 'EXPO_PUBLIC_WEB_ORIGIN';

const SEARCH_PATH = '/api/maps-search';
const REVERSE_PATH = '/api/maps-reverse';

/** A deployment problem — a missing or malformed origin — never a customer's. */
export class MapsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapsConfigError';
  }
}

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

/**
 * The web deployment's origin. Throws rather than falling back to a guess: a
 * wrong origin fails as an unexplained blank map, while a named error appears
 * in the Expo logs the moment the app starts using maps.
 */
export const getWebOrigin = (): string => {
  const raw = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();

  if (!raw) {
    throw new MapsConfigError(
      `Missing ${ORIGIN_VARIABLE}. Set it to the Rownel web deployment, e.g. https://row-nel.com`
    );
  }

  if (!/^https?:\/\//i.test(raw)) {
    throw new MapsConfigError(
      `${ORIGIN_VARIABLE} must include the scheme, e.g. https://row-nel.com — got "${raw}".`
    );
  }

  return trimTrailingSlashes(raw);
};

/** True when maps are configured at all, for screens that hide rather than fail. */
export const hasWebOrigin = (): boolean => {
  try {
    getWebOrigin();
    return true;
  } catch {
    return false;
  }
};

export const buildSearchUrl = (params: URLSearchParams): string =>
  `${getWebOrigin()}${SEARCH_PATH}?${params}`;

export const buildReverseUrl = (params: URLSearchParams): string =>
  `${getWebOrigin()}${REVERSE_PATH}?${params}`;
