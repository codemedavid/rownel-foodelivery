import React, { useState, useEffect } from 'react';
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
  Phone,
  History,
  ExternalLink,
} from 'lucide-react';
import { useConvexOrderById, useConvexOrdersByPhone } from '../hooks/useConvexOrders';
import type { ConvexOrder } from '../hooks/useConvexOrders';
import CustomerRiderPanel from './CustomerRiderPanel';

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: Clock, color: 'text-yellow-500' },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle, color: 'text-blue-500' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, color: 'text-orange-500' },
  { key: 'ready', label: 'Ready', icon: Package, color: 'text-green-500' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck, color: 'text-amber-500' },
  { key: 'completed', label: 'Completed', icon: CheckCircle, color: 'text-green-600' },
] as const;

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']);

interface LocalOrderRecord {
  orderId: string;
  merchantId: string;
  merchantName: string;
  customerName: string;
  contactNumber: string;
  total: number;
  deliveryFee: number;
  address: string;
  paymentMethod: string;
  placedAt: number;
  items: Array<{ name: string; quantity: number; subtotal: number }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
    confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-700' },
    preparing: { label: 'Preparing', className: 'bg-orange-100 text-orange-700' },
    ready: { label: 'Ready', className: 'bg-green-100 text-green-700' },
    out_for_delivery: { label: 'Out for Delivery', className: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Completed', className: 'bg-gray-100 text-gray-600' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-600' },
  };
  const s = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.className}`}>
      {s.label}
    </span>
  );
}

function OrderDetail({ order }: { order: ConvexOrder }) {
  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Order Status</h2>
          <span className="font-mono text-xs text-gray-400">{order._id}</span>
        </div>

        {isCancelled ? (
          <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
            <XCircle size={24} className="text-red-500" />
            <div>
              <p className="font-semibold text-red-700">Order Cancelled</p>
              <p className="text-sm text-red-500">This order has been cancelled.</p>
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
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCompleted ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Icon size={20} className={isCompleted ? step.color : 'text-gray-300'} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
                    {isCurrent && <p className="text-sm text-green-600 font-medium">Current status</p>}
                  </div>
                  {isCompleted && <CheckCircle size={16} className="text-green-500" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {order.serviceType === 'delivery' && order.status !== 'cancelled' && (
        <CustomerRiderPanel
          orderId={order._id}
          assignedRiderId={(order as any).assignedRiderId}
          orderStatus={order.status}
          contactNumber={order.contactNumber}
          deliveryLatitude={(order as any).deliveryLatitude}
          deliveryLongitude={(order as any).deliveryLongitude}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Order Details</h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Customer</span>
            <span className="font-medium">{order.customerName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Service</span>
            <span className="font-medium capitalize">{order.serviceType.replace('-', ' ')}</span>
          </div>
          {order.deliveryMode && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Delivery Mode</span>
              <span className={`font-medium capitalize ${order.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                {order.deliveryMode === 'economy' ? 'Economy (Fixed)' : 'Priority (Distance)'}
              </span>
            </div>
          )}
          {order.address && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Address</span>
              <span className="font-medium text-right max-w-[60%]">{order.address}</span>
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
                weekday: 'short', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Items</h2>
        <div className="space-y-3">
          {order.order_items.map((item) => (
            <div key={item._id} className="flex justify-between items-start text-sm">
              <div>
                <p className="font-medium">{item.name}</p>
                {item.variation && <p className="text-gray-400 text-xs">{(item.variation as any).name}</p>}
                {item.addOns && Array.isArray(item.addOns) && item.addOns.length > 0 && (
                  <p className="text-gray-400 text-xs">+ {(item.addOns as any[]).map((a) => a.name).join(', ')}</p>
                )}
                <p className="text-gray-400 text-xs">x{item.quantity}</p>
              </div>
              <p className="font-medium">₱{item.subtotal.toFixed(2)}</p>
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
            <span className="text-red-600">₱{order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function PhoneLookupTab({ onSelectOrder }: { onSelectOrder: (id: string) => void }) {
  const [phoneInput, setPhoneInput] = useState('');
  const [searchPhone, setSearchPhone] = useState<string | null>(null);
  const { orders, loading } = useConvexOrdersByPhone(searchPhone);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneInput.trim()) setSearchPhone(phoneInput.trim());
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="tel"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          placeholder="09XX XXX XXXX"
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <Search size={20} />
        </button>
      </form>

      {loading && searchPhone && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <div className="animate-spin w-6 h-6 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Looking up orders...</p>
        </div>
      )}

      {!loading && searchPhone && orders.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <Phone size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No orders found</p>
          <p className="text-gray-400 text-sm mt-1">No orders were placed with this number.</p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{orders.length} order{orders.length !== 1 ? 's' : ''} found</p>
          {orders.map((order) => (
            <button
              key={order._id}
              onClick={() => onSelectOrder(order._id)}
              className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:shadow-md transition-shadow border border-transparent hover:border-red-200"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-gray-400 truncate max-w-[55%]">{order._id}</span>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{order.customerName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(order._creationTime).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-600">₱{order.total.toFixed(2)}</p>
                  <ExternalLink size={14} className="text-gray-400 ml-auto mt-1" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!searchPhone && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <Phone size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Find Your Orders</h2>
          <p className="text-gray-500 text-sm">Enter the phone number you used when placing your order.</p>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ onSelectOrder }: { onSelectOrder: (id: string) => void }) {
  const [history, setHistory] = useState<LocalOrderRecord[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('orderHistory');
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <History size={48} className="text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-800 mb-2">No Order History</h2>
        <p className="text-gray-500 text-sm">Orders you place on this device will appear here.</p>
      </div>
    );
  }

  const activeOrders = history.filter((r) => {
    // We only know the orderId; status comes from Convex live data, so mark recent ones
    const ageMs = Date.now() - r.placedAt;
    return ageMs < 24 * 60 * 60 * 1000; // show as potentially active if < 24h
  });

  const olderOrders = history.filter((r) => {
    const ageMs = Date.now() - r.placedAt;
    return ageMs >= 24 * 60 * 60 * 1000;
  });

  const renderCard = (record: LocalOrderRecord) => (
    <button
      key={record.orderId}
      onClick={() => onSelectOrder(record.orderId)}
      className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:shadow-md transition-shadow border border-transparent hover:border-red-200"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-gray-800 text-sm truncate max-w-[60%]">{record.merchantName}</span>
        <span className="text-xs text-gray-400">
          {new Date(record.placedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{record.items.map(i => `${i.name} x${i.quantity}`).join(', ')}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-mono truncate max-w-[55%]">{record.orderId}</span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-red-600 text-sm">₱{record.total.toFixed(2)}</span>
          <ExternalLink size={14} className="text-gray-400" />
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      {activeOrders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent (last 24h)</p>
          <div className="space-y-3">{activeOrders.map(renderCard)}</div>
        </div>
      )}
      {olderOrders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Older Orders</p>
          <div className="space-y-3">{olderOrders.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}

type Tab = 'track' | 'phone' | 'history';

const OrderTracking: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>(orderId ? 'track' : 'history');
  const { order, loading } = useConvexOrderById(orderId ?? null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) navigate(`/track/${searchId.trim()}`);
  };

  const handleSelectOrder = (id: string) => {
    navigate(`/track/${id}`);
    setActiveTab('track');
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'track', label: 'Track Order', icon: Search },
    { key: 'phone', label: 'By Phone', icon: Phone },
    { key: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Track Your Order</h1>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 flex border-t">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {activeTab === 'track' && (
          <>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Enter your Order ID..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <button type="submit" className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <Search size={20} />
              </button>
            </form>

            {loading && orderId && (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-500">Loading order details...</p>
              </div>
            )}

            {!loading && orderId && !order && (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <XCircle size={48} className="text-red-400 mx-auto mb-4" />
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Order Not Found</h2>
                <p className="text-gray-500">
                  No order found with ID: <span className="font-mono text-sm">{orderId}</span>
                </p>
                <p className="text-gray-400 text-sm mt-2">Please check the order ID and try again.</p>
              </div>
            )}

            {!orderId && (
              <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <Search size={48} className="text-gray-300 mx-auto mb-4" />
                <h2 className="text-lg font-semibold text-gray-800 mb-2">Enter Your Order ID</h2>
                <p className="text-gray-500">Use the search bar above to look up your order status.</p>
                <p className="text-sm text-gray-400 mt-3">
                  Or use the{' '}
                  <button className="text-red-600 underline" onClick={() => setActiveTab('phone')}>By Phone</button>
                  {' '}tab to find orders by your phone number.
                </p>
              </div>
            )}

            {order && <OrderDetail order={order} />}
          </>
        )}

        {activeTab === 'phone' && <PhoneLookupTab onSelectOrder={handleSelectOrder} />}

        {activeTab === 'history' && <HistoryTab onSelectOrder={handleSelectOrder} />}
      </div>
    </div>
  );
};

export default OrderTracking;
