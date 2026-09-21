import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ReceiptText, ShoppingBag, User } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';

const OPERATIONAL_PREFIXES = ['/admin', '/staff', '/rider'];

const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/orders', label: 'Orders', icon: ReceiptText },
  { to: '/cart', label: 'Cart', icon: ShoppingBag },
  { to: '/profile', label: 'Profile', icon: User },
] as const;

function isTabActive(tabPath: string, currentPath: string) {
  if (tabPath === '/') return currentPath === '/';
  if (tabPath === '/orders') return currentPath === '/orders' || currentPath.startsWith('/track');
  return currentPath === tabPath || currentPath.startsWith(`${tabPath}/`);
}

/**
 * Persistent customer bottom navigation (mobile). Hidden on the admin, staff
 * and rider surfaces, which have their own navigation.
 */
const BottomNav: React.FC = () => {
  const { pathname } = useLocation();
  const { getTotalItems } = useCartContext();

  if (OPERATIONAL_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const cartCount = getTotalItems();

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden safe-bottom"
    >
      <div className="flex items-stretch justify-around">
        {TABS.map(({ to, label, icon: Icon }) => {
          const isActive = isTabActive(to, pathname);
          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                isActive ? 'text-brand-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                {to === '/cart' && cartCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
