// Pin elements for MapKit annotations.
//
// A MapKit Annotation is constructed with a factory that returns a DOM element,
// not a React node, so these build the markup directly.
//
// Styling is inline rather than Tailwind classes because this module has two
// homes: the React app, and the standalone map page the Expo app loads in a
// WebView (src/mapEmbed). That page carries no Tailwind build, and a pin that
// silently lost its background there would be a white circle on a white map.
// The values below are the exact ones the Tailwind classes resolved to, so the
// web app looks unchanged.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tailwind's palette, for the handful of colours the pins use. */
const COLORS = {
  white: '#ffffff',
  red600: '#dc2626',
  orange500: '#f97316',
  green600: '#16a34a',
  amber500: '#f59e0b',
} as const;

const SHADOW_MD = '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
const SHADOW_LG = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
const DROP_SHADOW_MD =
  'drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))';

const svgElement = (size: number): SVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  return svg;
};

/** A stroked glyph — outline drawings such as the bicycle. */
const strokedGlyph = (size: number, strokeWidth: number, paths: string): SVGElement => {
  const svg = svgElement(size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', COLORS.white);
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = paths;
  return svg;
};

/** A filled glyph — solid shapes such as the teardrop marker. */
const filledGlyph = (size: number, fill: string, paths: string): SVGElement => {
  const svg = svgElement(size);
  svg.setAttribute('fill', fill);
  svg.innerHTML = paths;
  return svg;
};

/** Bicycle, matching the rider iconography used elsewhere in the app. */
const bikeGlyph = (size: number, strokeWidth: number): SVGElement =>
  strokedGlyph(
    size,
    strokeWidth,
    '<circle cx="5.5" cy="17.5" r="3.5" />' +
      '<circle cx="18.5" cy="17.5" r="3.5" />' +
      '<path d="M15 6a1 1 0 0 0 0-2h-1l-5 8H4" />' +
      '<path d="m6 17 3.5-7h8l1.5 7" />'
  );

/** Teardrop map marker, filled rather than outlined. */
const markerGlyph = (size: number, fill: string): SVGElement =>
  filledGlyph(
    size,
    fill,
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 ' +
      '9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />'
  );

/** Shopfront, for the merchant an order is collected from. */
const storefrontGlyph = (size: number, strokeWidth: number): SVGElement =>
  strokedGlyph(
    size,
    strokeWidth,
    '<path d="M3 9.5 4.5 4h15L21 9.5" />' +
      '<path d="M3 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 5 0" />' +
      '<path d="M5 12v8h14v-8" />'
  );

interface BadgeOptions {
  /** Diameter of the circular badge, in pixels. */
  size: number;
  background: string;
  borderWidth: number;
  shadow: string;
  opacity?: number;
}

/** The circular, bordered disc every rider- and destination-style pin sits in. */
const badge = (glyph: SVGElement, options: BadgeOptions): HTMLElement => {
  const element = document.createElement('div');

  Object.assign(element.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: `${options.size}px`,
    height: `${options.size}px`,
    borderRadius: '9999px',
    border: `${options.borderWidth}px solid ${COLORS.white}`,
    backgroundColor: options.background,
    boxShadow: options.shadow,
    ...(options.opacity === undefined ? {} : { opacity: String(options.opacity) }),
  });

  element.appendChild(glyph);
  return element;
};

/** The rider being followed: large, full-opacity, red. */
export const createTrackedRiderPin = (): HTMLElement =>
  badge(bikeGlyph(20, 2), {
    size: 40,
    background: COLORS.red600,
    borderWidth: 3,
    shadow: SHADOW_LG,
  });

/** Other riders in the area: smaller and dimmed, so they read as context. */
export const createAmbientRiderPin = (): HTMLElement =>
  badge(bikeGlyph(14, 2.5), {
    size: 28,
    background: COLORS.orange500,
    borderWidth: 2,
    shadow: SHADOW_MD,
    opacity: 0.85,
  });

/** The delivery destination. */
export const createDeliveryPin = (): HTMLElement =>
  badge(markerGlyph(16, COLORS.white), {
    size: 32,
    background: COLORS.green600,
    borderWidth: 2,
    shadow: SHADOW_MD,
  });

/** The merchant an order is collected from — the rider's first stop. */
export const createMerchantPin = (): HTMLElement =>
  badge(storefrontGlyph(16, 2), {
    size: 32,
    background: COLORS.amber500,
    borderWidth: 2,
    shadow: SHADOW_MD,
  });

/** The address the customer is choosing, which they can drag. */
export const createLocationPin = (): HTMLElement => {
  const element = document.createElement('div');
  element.style.filter = DROP_SHADOW_MD;
  element.appendChild(markerGlyph(32, COLORS.red600));
  return element;
};

/** Every pin this app draws, by the name the map embed's protocol uses. */
export const PIN_FACTORIES = {
  'tracked-rider': createTrackedRiderPin,
  'ambient-rider': createAmbientRiderPin,
  delivery: createDeliveryPin,
  merchant: createMerchantPin,
  location: createLocationPin,
} as const;

export type MapPinKind = keyof typeof PIN_FACTORIES;
