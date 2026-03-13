import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Package,
  CheckCircle,
  Clock,
  ChefHat,
  Truck,
  XCircle,
  Search,
  ArrowLeft,
} from 'lucide-react';
import { useConvexOrderById } from '../hooks/useConvexOrders';

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: Clock, color: 'text-yellow-500' },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle, color: 'text-blue-500' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, color: 'text-orange-500' },
  { key: 'ready', label: 'Ready', icon: Package, color: 'text-green-500' },
  { key: 'completed', label: 'Completed', icon: Truck, color: 'text-green-600' },
] as const;

const OrderTracking: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState('');
  const { order, loading } = useConvexOrderById(orderId ?? null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      navigate(`/track/${searchId.trim()}`);
    }
  };

  const currentStepIndex = order
    ? STATUS_STEPS.findIndex((s) => s.key === order.status)
    : -1;

  const isCancelled = order?.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Track Your Order</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Enter your Order ID..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Search size={20} />
          </button>
        </form>

        {/* Loading state */}
        {loading && orderId && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading order details...</p>
          </div>
        )}

        {/* Not found */}
        {!loading && orderId && !order && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <XCircle size={48} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Order Not Found</h2>
            <p className="text-gray-500">
              No order found with ID: <span className="font-mono text-sm">{orderId}</span>
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Please check the order ID and try again.
            </p>
          </div>
        )}

        {/* No order ID yet */}
        {!orderId && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Search size={48} className="text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Enter Your Order ID
            </h2>
            <p className="text-gray-500">
              Use the search bar above to look up your order status.
            </p>
          </div>
        )}

        {/* Order found */}
        {order && (
          <>
            {/* Status progress */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Order Status</h2>
                <span className="font-mono text-xs text-gray-400">
                  {order._id}
                </span>
              </div>

              {isCancelled ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
                  <XCircle size={24} className="text-red-500" />
                  <div>
                    <p className="font-semibold text-red-700">Order Cancelled</p>
                    <p className="text-sm text-red-500">
                      This order has been cancelled.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {STATUS_STEPS.map((step, index) => {
                    const isCompleted = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    const Icon = step.icon;

                    return (
                      <div key={step.key} className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isCompleted
                              ? 'bg-green-100'
                              : 'bg-gray-100'
                          }`}
                        >
                          <Icon
                            size={20}
                            className={
                              isCompleted
                                ? step.color
                                : 'text-gray-300'
                            }
                          />
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              isCompleted ? 'text-gray-800' : 'text-gray-400'
                            }`}
                          >
                            {step.label}
                          </p>
                          {isCurrent && (
                            <p className="text-sm text-green-600 font-medium">
                              Current status
                            </p>
                          )}
                        </div>
                        {isCompleted && (
                          <CheckCircle size={16} className="text-green-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order details */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Order Details
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{order.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium capitalize">
                    {order.serviceType.replace('-', ' ')}
                  </span>
                </div>
                {order.address && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Address</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {order.address}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Payment</span>
                  <span className="font-medium">{order.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Placed</span>
                  <span className="font-medium">
                    {new Date(order._creationTime).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Items</h2>
              <div className="space-y-3">
                {order.order_items.map((item) => (
                  <div
                    key={item._id}
                    className="flex justify-between items-start text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.variation && (
                        <p className="text-gray-400 text-xs">
                          {(item.variation as any).name}
                        </p>
                      )}
                      {item.addOns &&
                        Array.isArray(item.addOns) &&
                        item.addOns.length > 0 && (
                          <p className="text-gray-400 text-xs">
                            +{' '}
                            {(item.addOns as any[])
                              .map((a) => a.name)
                              .join(', ')}
                          </p>
                        )}
                      <p className="text-gray-400 text-xs">
                        x{item.quantity}
                      </p>
                    </div>
                    <p className="font-medium">
                      ₱{item.subtotal.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t mt-4 pt-4">
                {order.deliveryFee != null && order.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Delivery Fee</span>
                    <span>₱{order.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-red-600">
                    ₱{order.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
