// Pin elements for MapKit annotations.
//
// A MapKit Annotation is constructed with a factory that returns a DOM element,
// not a React node, so these build the markup directly. The Tailwind classes
// are the same ones the React pins used, so the map looks unchanged.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Bicycle glyph, matching the rider iconography used elsewhere in the app. */
const bikeGlyph = (size: number, strokeWidth: number): SVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#fff');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML =
    '<circle cx="5.5" cy="17.5" r="3.5" />' +
    '<circle cx="18.5" cy="17.5" r="3.5" />' +
    '<path d="M15 6a1 1 0 0 0 0-2h-1l-5 8H4" />' +
    '<path d="m6 17 3.5-7h8l1.5 7" />';
  return svg;
};

/** Teardrop map marker, filled rather than outlined. */
const markerGlyph = (size: number, fill: string): SVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', fill);
  svg.innerHTML =
    '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 ' +
    '9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />';
  return svg;
};

const badge = (className: string, glyph: SVGElement): HTMLElement => {
  const element = document.createElement('div');
  element.className = className;
  element.appendChild(glyph);
  return element;
};

/** The rider being followed: large, full-opacity, red. */
export const createTrackedRiderPin = (): HTMLElement =>
  badge(
    'flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-red-600 shadow-lg',
    bikeGlyph(20, 2)
  );

/** Other riders in the area: smaller and dimmed, so they read as context. */
export const createAmbientRiderPin = (): HTMLElement =>
  badge(
    'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orange-500 opacity-85 shadow-md',
    bikeGlyph(14, 2.5)
  );

/** The delivery destination. */
export const createDeliveryPin = (): HTMLElement =>
  badge(
    'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-green-600 shadow-md',
    markerGlyph(16, '#fff')
  );

/** The address the customer is choosing, which they can drag. */
export const createLocationPin = (): HTMLElement => {
  const element = document.createElement('div');
  element.className = 'drop-shadow-md';
  element.appendChild(markerGlyph(32, '#dc2626'));
  return element;
};
