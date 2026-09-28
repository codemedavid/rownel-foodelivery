// Human-readable lines for an order item's chosen options. order_items stores
// the variation either as one { name, price } object or as a map of
// group -> { name, price }, and add-ons as [{ name, price, quantity }].

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nameOf = (value: unknown): string | null =>
  isRow(value) && typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null;

const describeVariation = (variation: unknown): string[] => {
  if (typeof variation === 'string') return variation.trim() ? [variation.trim()] : [];
  if (!isRow(variation)) return [];

  const single = nameOf(variation);
  if (single) return [single];

  return Object.entries(variation).flatMap(([group, choice]) => {
    const choiceName = nameOf(choice);
    return choiceName ? [`${group}: ${choiceName}`] : [];
  });
};

const describeAddOns = (addOns: unknown): string[] => {
  if (!Array.isArray(addOns)) return [];
  return addOns.flatMap((addOn) => {
    const addOnName = nameOf(addOn);
    if (!addOnName) return [];
    const quantity = Number((addOn as Row).quantity);
    return [quantity > 1 ? `+ ${addOnName} ×${quantity}` : `+ ${addOnName}`];
  });
};

export const describeItemOptions = (variation: unknown, addOns: unknown): string[] => [
  ...describeVariation(variation),
  ...describeAddOns(addOns),
];

/** "2× Chickenjoy, 1× Sundae" — a one-line preview of what is in the bag. */
export const summarizeItems = (items: ReadonlyArray<{ name: string; quantity: number }>): string =>
  items.map((item) => `${item.quantity}× ${item.name}`).join(', ');
