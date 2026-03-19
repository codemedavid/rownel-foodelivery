import React, { useState, useMemo } from 'react';
import { Search, LogOut, Clock, CheckCircle, ChefHat, Package, Truck, XCircle, Eye, X, Filter, Store, MapPin, CreditCard, Hash, Ruler, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConvexOrdersByMerchants, ConvexOrder } from '../hooks/useConvexOrders';
import { useNewOrderNotification } from '../hooks/useNewOrderNotification';
import { useMerchants } from '../hooks/useMerchants';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

const StaffOrdersPanel: React.FC = () => {
  const { user, signOut } = useAuth();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<ConvexOrder | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Fetch staff record from Convex using Supabase user ID
  const staffRecord = useQuery(
    api.staff.getBySupabaseUser,
    user ? { supabaseUserId: user.id } : 'skip'
  );

  // Resolve merchant IDs with backward compat: old merchantId → [merchantId]
  const merchantIds = staffRecord?.merchantIds
    ?? (staffRecord?.merchantId ? [staffRecord.merchantId] : null);
  const allMerchants = staffRecord?.allMerchants ?? false;

  // Fetch orders for the staff's merchants
  const { orders, loading: ordersLoading, updateOrderStatus } = useConvexOrdersByMerchants(merchantIds, allMerchants);
  const { requestPermission } = useNewOrderNotification(orders);
  const { merchants } = useMerchants();

  // Build a merchantId → merchant name lookup
  const merchantMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of merchants) {
      map[m.id] = m.name;
    }
    return map;
  }, [merchants]);

  const isLoadingStaff = staffRecord === undefined;
  const staffNotFound = staffRecord === null;

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'preparing': return 'bg-blue-100 text-blue-800';
      case 'ready': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'confirmed': return <CheckCircle className="h-4 w-4" />;
      case 'preparing': return <ChefHat className="h-4 w-4" />;
      case 'ready': return <Package className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'cancelled': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      setUpdating(orderId);
      await updateOrderStatus(
        orderId as Id<"orders">,
        newStatus as OrderStatus
      );
    } catch {
      alert('Failed to update order status');
    } finally {
      setUpdating(null);
    }
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatServiceType = (serviceType: string) => {
    return serviceType.charAt(0).toUpperCase() + serviceType.slice(1).replace('-', ' ');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = statusFilter === 'all'
      ? orders
      : orders.filter((o) => o.status.toLowerCase() === statusFilter);

    if (q.length === 0) return base;

    return base.filter(
      (o) =>
        o.customerName.toLowerCase().includes(q) ||
        o.contactNumber.toLowerCase().includes(q) ||
        (o._id as string).toLowerCase().includes(q) ||
        (o.address || '').toLowerCase().includes(q) ||
        (merchantMap[o.merchantId] || '').toLowerCase().includes(q) ||
        (o.referenceNumber || '').toLowerCase().includes(q)
    );
  }, [orders, query, statusFilter, merchantMap]);

  // ---------- Loading / Error states ----------

  if (isLoadingStaff) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading staff account...</p>
        </div>
      </div>
    );
  }

  if (staffNotFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-playfair font-semibold text-black mb-2">Staff Account Not Found</h1>
          <p className="text-gray-600 mb-6">
            Your account is not linked to any merchant. Please contact an administrator.
          </p>
          <button
            onClick={signOut}
            className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (staffRecord && !staffRecord.isActive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Account Deactivated</h2>
          <p className="text-gray-500 mb-4">Your staff account has been deactivated. Contact your administrator.</p>
          <button onClick={signOut} className="px-4 py-2 bg-red-600 text-white rounded-lg">Sign Out</button>
        </div>
      </div>
    );
  }

  // ---------- Main panel ----------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                <ChefHat className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-black">Order Management</h1>
                <p className="text-xs text-gray-500">
                  {staffRecord.name}
                  {allMerchants ? (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">All Merchants</span>
                  ) : merchantIds && merchantIds.length > 1 ? (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{merchantIds.length} merchants</span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={requestPermission}
                className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors duration-200"
              >
                Enable Notifications
              </button>
              <button
                onClick={signOut}
                className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Search & Filter */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, phone, ID, address, merchant"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="mt-3 text-sm text-gray-500">
            {filtered.length} order{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Orders */}
        {ordersLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Orders</h2>
            <p className="text-gray-600">Orders will appear here when customers place them.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => (
              <div
                key={order._id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      #{(order._id as string).slice(-8).toUpperCase()}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
                    >
                      {getStatusIcon(order.status)}
                      <span className="capitalize">{order.status}</span>
                    </span>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    &#8369;{order.total.toFixed(2)}
                  </span>
                </div>

                {/* Merchant name */}
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                  <Store className="h-3 w-3" />
                  <span>{merchantMap[order.merchantId] || 'Unknown Merchant'}</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{order.customerName}</p>
                    <p className="text-sm text-gray-500">{order.contactNumber}</p>
                  </div>
                  <div className="text-sm text-gray-500 text-right">
                    <p>
                      {formatServiceType(order.serviceType)}
                      {order.serviceType === 'delivery' && order.deliveryMode && (
                        <span className={`ml-1 text-xs ${order.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                          ({order.deliveryMode === 'economy' ? 'Economy' : 'Priority'})
                        </span>
                      )}
                    </p>
                    <p className="text-xs">{formatDateTime(order._creationTime)}</p>
                  </div>
                </div>

                {/* Quick info row */}
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span className="capitalize">{order.paymentMethod}{order.referenceNumber ? ` | Ref: ${order.referenceNumber}` : ''}</span>
                  <span>{order.order_items.length} item(s)</span>
                </div>

                {order.address && (
                  <div className="flex items-start gap-1 text-xs text-gray-500 mb-3">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="truncate">{order.address}</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <select
                    value={order.status}
                    onChange={(e) => handleStatusUpdate(order._id, e.target.value)}
                    disabled={updating === order._id}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  {updating === order._id && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Order #{(selectedOrder._id as string).slice(-8).toUpperCase()}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(selectedOrder.status)}`}
                >
                  {getStatusIcon(selectedOrder.status)}
                  <span className="capitalize">{selectedOrder.status}</span>
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Merchant Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                <Store className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-blue-900">{merchantMap[selectedOrder.merchantId] || 'Unknown Merchant'}</div>
                </div>
              </div>

              {/* Customer info */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Customer</h4>
                <div className="text-sm space-y-1">
                  <p><strong>Name:</strong> {selectedOrder.customerName}</p>
                  <p><strong>Contact:</strong> {selectedOrder.contactNumber}</p>
                  <p><strong>Ordered:</strong> {formatDateTime(selectedOrder._creationTime)}</p>
                </div>
              </div>

              {/* Service & Delivery */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Service &amp; Delivery</h4>
                <div className="text-sm space-y-1">
                  <p><strong>Service:</strong> {formatServiceType(selectedOrder.serviceType)}</p>
                  {selectedOrder.deliveryMode && (
                    <p>
                      <strong>Delivery Mode:</strong>{' '}
                      <span className={`font-medium ${selectedOrder.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                        {selectedOrder.deliveryMode === 'economy' ? 'Economy (Fixed)' : 'Priority (Distance)'}
                      </span>
                    </p>
                  )}
                  {selectedOrder.address && (
                    <p className="flex items-start gap-1">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span><strong>Address:</strong> {selectedOrder.address}</span>
                    </p>
                  )}
                  {selectedOrder.distanceKm != null && selectedOrder.distanceKm > 0 && (
                    <p className="flex items-center gap-1">
                      <Ruler className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span><strong>Distance:</strong> {selectedOrder.distanceKm.toFixed(2)} km</span>
                    </p>
                  )}
                  {selectedOrder.deliveryFee != null && selectedOrder.deliveryFee > 0 && (
                    <p><strong>Delivery Fee:</strong> &#8369;{selectedOrder.deliveryFee.toFixed(2)}</p>
                  )}
                  {selectedOrder.deliveryFeeBreakdown && (
                    <div className="bg-gray-50 rounded p-2 text-xs text-gray-600">
                      <strong>Fee Breakdown:</strong>
                      <ul className="mt-1 space-y-0.5">
                        {Object.entries(selectedOrder.deliveryFeeBreakdown as Record<string, unknown>).map(([key, value]) => (
                          <li key={key} className="flex justify-between">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                            <span>{typeof value === 'number' ? `₱${value.toFixed(2)}` : String(value)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedOrder.pickupTime && <p><strong>Pickup Time:</strong> {selectedOrder.pickupTime}</p>}
                  {selectedOrder.partySize != null && selectedOrder.partySize > 0 && (
                    <p><strong>Party Size:</strong> {selectedOrder.partySize} person{selectedOrder.partySize !== 1 ? 's' : ''}</p>
                  )}
                  {selectedOrder.dineInTime && <p><strong>Dine-in Time:</strong> {formatDateTime(new Date(selectedOrder.dineInTime).getTime())}</p>}
                </div>
              </div>

              {/* Payment Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment
                </h4>
                <div className="text-sm space-y-1">
                  <p><strong>Method:</strong> <span className="capitalize">{selectedOrder.paymentMethod}</span></p>
                  {selectedOrder.referenceNumber && (
                    <p className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-gray-400" />
                      <strong>Reference:</strong> {selectedOrder.referenceNumber}
                    </p>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <h4 className="font-semibold text-gray-900 mb-1">Notes</h4>
                  <p className="text-sm text-gray-700">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Payment Receipt */}
              {selectedOrder.receiptUrl && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Payment Receipt
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <a
                      href={selectedOrder.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <img
                        src={selectedOrder.receiptUrl}
                        alt="Payment Receipt"
                        className="w-full max-w-sm mx-auto rounded-lg border-2 border-gray-300 group-hover:border-blue-500 transition-colors cursor-pointer"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3Ctext fill="%239ca3af" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3EImage not available%3C/text%3E%3C/svg%3E';
                        }}
                      />
                      <p className="text-center text-sm text-blue-600 group-hover:text-blue-700 mt-2">
                        Click to view full size
                      </p>
                    </a>
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Items ({selectedOrder.order_items.length})</h4>
                <div className="space-y-2">
                  {selectedOrder.order_items.map((item) => (
                    <div key={item._id} className="p-3 bg-gray-50 rounded-lg flex justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.variation && (
                          <p className="text-xs text-gray-600">
                            {typeof item.variation === 'object' && item.variation.name
                              ? `Size: ${item.variation.name}${item.variation.price != null ? ` (+₱${Number(item.variation.price).toFixed(2)})` : ''}`
                              : `Variation: ${String(item.variation)}`
                            }
                          </p>
                        )}
                        {item.addOns && item.addOns.length > 0 && (
                          <p className="text-xs text-gray-600">
                            Add-ons: {item.addOns.map((a: any) =>
                              a.quantity > 1
                                ? `${a.name} x${a.quantity}${a.price != null ? ` (+₱${(Number(a.price) * a.quantity).toFixed(2)})` : ''}`
                                : `${a.name}${a.price != null ? ` (+₱${Number(a.price).toFixed(2)})` : ''}`
                            ).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">&#8369;{item.unitPrice.toFixed(2)} x {item.quantity}</p>
                        <p className="text-gray-500">&#8369;{item.subtotal.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Items Subtotal</span>
                  <span>&#8369;{selectedOrder.order_items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}</span>
                </div>
                {selectedOrder.deliveryFee != null && selectedOrder.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery Fee</span>
                    <span>&#8369;{selectedOrder.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t pt-2">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-bold text-red-600">
                    &#8369;{selectedOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffOrdersPanel;
