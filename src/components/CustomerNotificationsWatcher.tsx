import { useLocation } from 'react-router-dom';
import { useCustomerOrderNotifications } from '../hooks/useCustomerOrderNotifications';

const OPERATIONAL_PREFIXES = ['/admin', '/staff', '/rider'];

function Watcher() {
  useCustomerOrderNotifications();
  return null;
}

/**
 * Mounts the customer order-status watcher on customer-facing routes so the
 * shopper is notified (sound + browser notification) when their order is
 * confirmed, prepared, out for delivery, etc.
 */
const CustomerNotificationsWatcher = () => {
  const { pathname } = useLocation();
  if (OPERATIONAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }
  return <Watcher />;
};

export default CustomerNotificationsWatcher;
