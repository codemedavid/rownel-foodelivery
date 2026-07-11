import type { DeliveryMode } from './deliveryTypes';

/**
 * Resolves the delivery mode to persist with an order.
 *
 * The orders.delivery_mode column is NOT NULL. When a merchant offers no
 * economy option we must still send a concrete mode — never undefined/null —
 * otherwise the create_order() RPC inserts an explicit NULL that bypasses the
 * column DEFAULT and violates the NOT-NULL constraint.
 */
export function resolveDeliveryMode(
  hasEconomyOption: boolean,
  selectedMode: DeliveryMode
): DeliveryMode {
  return hasEconomyOption ? selectedMode : 'priority';
}
