import React, { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Clock, XCircle, RefreshCw, ChevronDown, Search, Image as ImageIcon, Download, Calendar, DollarSign, Store, MapPin, CreditCard, Hash, Ruler } from 'lucide-react';
import { useConvexOrders, ConvexOrder } from '../hooks/useConvexOrders';
import { useNewOrderNotification } from '../hooks/useNewOrderNotification';
import { useMerchants } from '../hooks/useMerchants';
import type { Id } from '../../convex/_generated/dataModel';

interface OrdersManagerProps {
  onBack: () => void;
}

const OrdersManager: React.FC<OrdersManagerProps> = ({ onBack }) => {
  const { orders, loading, updateOrderStatus } = useConvexOrders();
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
  const [error] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ConvexOrder | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'>('all');
  const [sortKey, setSortKey] = useState<'_creationTime' | 'total' | 'customerName' | 'status'>('_creationTime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'preparing':
        return 'bg-blue-100 text-blue-800';
      case 'ready':
        return 'bg-purple-100 text-purple-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'confirmed':
        return <CheckCircle className="h-4 w-4" />;
      case 'preparing':
        return <RefreshCw className="h-4 w-4" />;
      case 'ready':
        return <CheckCircle className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      setUpdating(orderId);
      await updateOrderStatus(
        orderId as Id<"orders">,
        newStatus as "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled"
      );
    } catch (err) {
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
      minute: '2-digit'
    });
  };

  const formatDateTimeForCSV = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).replace(/,/g, ''); // Remove commas for CSV compatibility
  };

  const formatServiceType = (serviceType: string) => {
    return serviceType.charAt(0).toUpperCase() + serviceType.slice(1).replace('-', ' ');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = statusFilter === 'all' ? orders : orders.filter(o => o.status.toLowerCase() === statusFilter);

    // Apply date filters
    let dateFiltered = base;
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      dateFiltered = dateFiltered.filter(o => o._creationTime >= fromDate.getTime());
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      dateFiltered = dateFiltered.filter(o => o._creationTime <= toDate.getTime());
    }

    const searched = q.length === 0
      ? dateFiltered
      : dateFiltered.filter(o =>
          o.customerName.toLowerCase().includes(q) ||
          o.contactNumber.toLowerCase().includes(q) ||
          (o._id as string).toLowerCase().includes(q) ||
          (o.address || '').toLowerCase().includes(q) ||
          (merchantMap[o.merchantId] || '').toLowerCase().includes(q) ||
          (o.referenceNumber || '').toLowerCase().includes(q)
        );
    const sorted = [...searched].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'total':
          return (a.total - b.total) * dir;
        case 'customerName':
          return a.customerName.localeCompare(b.customerName) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case '_creationTime':
        default:
          return (a._creationTime - b._creationTime) * dir;
      }
    });
    return sorted;
  }, [orders, query, statusFilter, sortKey, sortDir, dateFrom, dateTo]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === '_creationTime' ? 'desc' : 'asc');
    }
  };

  const exportToCSV = () => {
    setExporting(true);
    try {
      // Filter completed orders only
      const completedOrders = filtered.filter(o => o.status.toLowerCase() === 'completed');

      if (completedOrders.length === 0) {
        alert('No completed orders to export.');
        setExporting(false);
        return;
      }

      // CSV Headers - Exact order as specified
      const headers = [
        'OrderID',
        'CustName',
        'ContactNum',
        'Email',
        'TotalSpent',
        'OrderDateandTime',
        'ServiceType',
        'remarks'
      ];

      // CSV Rows - Exact order as specified
      const rows = completedOrders.map(order => {
        return [
          (order._id as string).slice(-8).toUpperCase(),
          order.customerName,
          order.contactNumber,
          'N/A', // Email field not in database
          order.total.toFixed(2),
          formatDateTimeForCSV(order._creationTime),
          formatServiceType(order.serviceType),
          order.notes || 'N/A'
        ];
      });

      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `completed_orders_${dateStr}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert(`Successfully exported ${completedOrders.length} completed order(s)!`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export orders. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const clearDateFilters = () => {
    setDateFrom('');
    setDateTo('');
  };

  // Calculate total sales from completed orders
  const totalSales = useMemo(() => {
    return filtered
      .filter(order => order.status.toLowerCase() === 'completed')
      .reduce((sum, order) => sum + order.total, 0);
  }, [filtered]);

  // Calculate number of completed orders
  const completedOrdersCount = useMemo(() => {
    return filtered.filter(order => order.status.toLowerCase() === 'completed').length;
  }, [filtered]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Orders</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={onBack}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
              <h1 className="text-2xl font-playfair font-semibold text-black">Orders Management</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={requestPermission}
                className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors duration-200"
              >
                Enable Notifications
              </button>
              <div className="text-sm text-gray-500">
                {orders.length} order{orders.length !== 1 ? 's' : ''} total
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200">
          <div className="flex flex-col gap-4">
            {/* Search and Status Row */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex-1 relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, phone, ID, address, merchant, ref#"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSort('_creationTime')}
                    className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1 ${sortKey==='_creationTime' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    Date
                    <ChevronDown className={`h-4 w-4 transition-transform ${sortKey==='_creationTime' && sortDir==='asc' ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    onClick={() => toggleSort('total')}
                    className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-1 ${sortKey==='total' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    Total
                    <ChevronDown className={`h-4 w-4 transition-transform ${sortKey==='total' && sortDir==='asc' ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Date Filter and Export Row */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between border-t border-gray-200 pt-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Date Range:</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="From"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="To"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={clearDateFilters}
                      className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={exportToCSV}
                disabled={exporting || filtered.filter(o => o.status.toLowerCase() === 'completed').length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                {exporting ? 'Exporting...' : 'Export Completed Orders'}
              </button>
            </div>

            {/* Results count */}
            {(dateFrom || dateTo) && (
              <div className="text-sm text-gray-600">
                Showing {filtered.length} order{filtered.length !== 1 ? 's' : ''}
                {dateFrom && ` from ${new Date(dateFrom).toLocaleDateString()}`}
                {dateTo && ` to ${new Date(dateTo).toLocaleDateString()}`}
              </div>
            )}
          </div>
        </div>

        {/* Sales Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium mb-1">Total Sales</p>
                <p className="text-3xl font-bold">&#8369;{totalSales.toFixed(2)}</p>
                <p className="text-green-100 text-xs mt-1">
                  {completedOrdersCount} completed order{completedOrdersCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg">
                <DollarSign className="h-8 w-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium mb-1">All Orders</p>
                <p className="text-3xl font-bold">{filtered.length}</p>
                <p className="text-blue-100 text-xs mt-1">
                  {statusFilter === 'all' ? 'All statuses' : statusFilter}
                </p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg">
                <Clock className="h-8 w-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium mb-1">Average Order</p>
                <p className="text-3xl font-bold">
                  &#8369;{completedOrdersCount > 0 ? (totalSales / completedOrdersCount).toFixed(2) : '0.00'}
                </p>
                <p className="text-purple-100 text-xs mt-1">
                  Per completed order
                </p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg">
                <CheckCircle className="h-8 w-8" />
              </div>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">&#128203;</div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Orders Yet</h2>
            <p className="text-gray-600">Orders will appear here when customers place them.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-5 py-3 text-left font-medium">Order</th>
                      <th className="px-5 py-3 text-left font-medium">Merchant</th>
                      <th className="px-5 py-3 text-left font-medium">Customer</th>
                      <th className="px-5 py-3 text-left font-medium">Service</th>
                      <th className="px-5 py-3 text-left font-medium">Payment</th>
                      <th className="px-5 py-3 text-left font-medium">Total</th>
                      <th className="px-5 py-3 text-left font-medium">Status</th>
                      <th className="px-5 py-3 text-left font-medium">Placed</th>
                      <th className="px-5 py-3 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filtered.map((order) => (
                      <tr key={order._id} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">#{(order._id as string).slice(-8).toUpperCase()}</div>
                          <div className="text-xs text-gray-500">{order.order_items.length} item(s)</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">{merchantMap[order.merchantId] || 'Unknown'}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">{order.customerName}</div>
                          <div className="text-xs text-gray-500">{order.contactNumber}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-gray-700">{formatServiceType(order.serviceType)}</div>
                          {order.serviceType === 'delivery' && order.deliveryMode && (
                            <div className={`text-xs ${order.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                              {order.deliveryMode === 'economy' ? 'Economy' : 'Priority'}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-gray-700 capitalize">{order.paymentMethod}</div>
                          {order.referenceNumber && (
                            <div className="text-xs text-gray-500">Ref: {order.referenceNumber}</div>
                          )}
                        </td>
                        <td className="px-5 py-4 font-semibold text-gray-900">&#8369;{order.total.toFixed(2)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                            {getStatusIcon(order.status)}
                            <span className="ml-1 capitalize">{order.status}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-700">{formatDateTime(order._creationTime)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
                            >
                              View
                            </button>
                            <select
                              value={order.status}
                              onChange={(e) => handleStatusUpdate(order._id, e.target.value)}
                              disabled={updating === order._id}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                            >
                              <option value="pending">Pending</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="preparing">Preparing</option>
                              <option value="ready">Ready</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            {updating === order._id && (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
              {filtered.map((order) => (
                <div key={order._id} className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-gray-900">#{(order._id as string).slice(-8).toUpperCase()}</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {getStatusIcon(order.status)}
                        <span className="ml-1 capitalize">{order.status}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <Store className="h-3 w-3" />
                      <span>{merchantMap[order.merchantId] || 'Unknown Merchant'}</span>
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      <div className="font-medium">{order.customerName}</div>
                      <div className="text-gray-500">{order.contactNumber}</div>
                    </div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="text-gray-600">
                        {formatServiceType(order.serviceType)}
                        {order.serviceType === 'delivery' && order.deliveryMode && (
                          <span className={`ml-1 text-xs ${order.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                            ({order.deliveryMode === 'economy' ? 'Economy' : 'Priority'})
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-gray-900">&#8369;{order.total.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="capitalize">{order.paymentMethod}{order.referenceNumber ? ` (Ref: ${order.referenceNumber})` : ''}</span>
                      <span>{order.order_items.length} item(s)</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{formatDateTime(order._creationTime)}</div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
                      >
                        Details
                      </button>
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusUpdate(order._id, e.target.value)}
                        disabled={updating === order._id}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="preparing">Preparing</option>
                        <option value="ready">Ready</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  Order #{(selectedOrder._id as string).slice(-8).toUpperCase()}
                </h3>
                <p className="text-sm text-gray-500 mt-1">Complete order details</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
              >
                <XCircle className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              {/* Merchant Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
                <Store className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-blue-900">{merchantMap[selectedOrder.merchantId] || 'Unknown Merchant'}</div>
                  <div className="text-xs text-blue-600">Merchant ID: {selectedOrder.merchantId}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Customer Information</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Name:</strong> {selectedOrder.customerName}</p>
                    <p><strong>Contact:</strong> {selectedOrder.contactNumber}</p>
                    <p><strong>Order Date:</strong> {formatDateTime(selectedOrder._creationTime)}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Service &amp; Delivery</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Service Type:</strong> {formatServiceType(selectedOrder.serviceType)}</p>
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
              </div>

              {/* Payment Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <p><strong>Method:</strong> <span className="capitalize">{selectedOrder.paymentMethod}</span></p>
                  {selectedOrder.referenceNumber && (
                    <p className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-gray-400" />
                      <strong>Reference:</strong> {selectedOrder.referenceNumber}
                    </p>
                  )}
                  <p><strong>Subtotal (Items):</strong> &#8369;{selectedOrder.order_items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}</p>
                  {selectedOrder.deliveryFee != null && selectedOrder.deliveryFee > 0 && (
                    <p><strong>Delivery Fee:</strong> &#8369;{selectedOrder.deliveryFee.toFixed(2)}</p>
                  )}
                  <p className="text-base font-bold col-span-full"><strong>Total:</strong> &#8369;{selectedOrder.total.toFixed(2)}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold text-gray-900 mb-1">Notes</h4>
                  <p className="text-sm text-gray-700">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Payment Receipt */}
              {selectedOrder.receiptUrl && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <ImageIcon className="h-5 w-5 mr-2" />
                    Payment Receipt
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <a
                      href={selectedOrder.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <img
                        src={selectedOrder.receiptUrl}
                        alt="Payment Receipt"
                        className="w-full max-w-md mx-auto rounded-lg border-2 border-gray-300 group-hover:border-blue-500 transition-colors cursor-pointer"
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

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Order Items ({selectedOrder.order_items.length})</h4>
                <div className="space-y-3">
                  {selectedOrder.order_items.map((item) => (
                    <div key={item._id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          {item.variation && (
                            <div className="text-sm text-gray-600 mt-1">
                              {typeof item.variation === 'object' && item.variation.name
                                ? `Size: ${item.variation.name}${item.variation.price != null ? ` (+₱${Number(item.variation.price).toFixed(2)})` : ''}`
                                : `Variation: ${String(item.variation)}`
                              }
                            </div>
                          )}
                          {item.addOns && item.addOns.length > 0 && (
                            <div className="text-sm text-gray-600 mt-1">
                              Add-ons: {item.addOns.map((addon: any) =>
                                addon.quantity > 1
                                  ? `${addon.name} x${addon.quantity}${addon.price != null ? ` (+₱${(Number(addon.price) * addon.quantity).toFixed(2)})` : ''}`
                                  : `${addon.name}${addon.price != null ? ` (+₱${Number(addon.price).toFixed(2)})` : ''}`
                              ).join(', ')}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-gray-900">&#8369;{item.unitPrice.toFixed(2)} x {item.quantity}</div>
                          <div className="text-sm text-gray-600">&#8369;{item.subtotal.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Total Summary */}
                <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
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
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total</span>
                    <span>&#8369;{selectedOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersManager;
