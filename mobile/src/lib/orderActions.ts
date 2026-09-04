import type { Order, StaffOrderStatus } from './adminTypes';

const CANCEL: StaffOrderStatus = 'cancelled';

/**
 * Status buttons staff may press for an order. Delivery orders that are
 * `ready` complete through the rider flow (mark_order_delivered), so staff
 * only get cancel there.
 */
export const nextStatusOptions = (order: Order): StaffOrderStatus[] => {
  switch (order.status) {
    case 'pending':
      return ['confirmed', CANCEL];
    case 'confirmed':
      return ['preparing', CANCEL];
    case 'preparing':
      return ['ready', CANCEL];
    case 'ready':
      return order.serviceType === 'delivery' ? [CANCEL] : ['completed', CANCEL];
    default:
      return [];
  }
};

export const canAssignRider = (order: Order): boolean =>
  order.serviceType === 'delivery' &&
  order.status !== 'out_for_delivery' &&
  order.status !== 'completed' &&
  order.status !== 'cancelled';

export const canUnassignRider = (order: Order): boolean =>
  !!order.assignedRiderId && canAssignRider(order);
