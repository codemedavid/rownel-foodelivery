import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ReceiptText, ShoppingCart, User } from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';

const OPERATIONAL_PREFIXES = ['/admin', '/staff', '/rider'];

const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/orders', label: 'Orders', icon: ReceiptText },
  { to: '/cart', label: 'Cart', icon: ShoppingCart },
  { to: '/profile', label: 'Profile', icon: User },
] as const;

function isTabActive(tabPath: string, currentPath: string) {
  if (tabPath === '/') return currentPath === '/';
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
      className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex justify-around items-stretch">
        {TABS.map(({ to, label, icon: Icon }) => {
          const isActive = isTabActive(to, pathname);
          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-0.5 flex-1 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-red-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                {to === '/cart' && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
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
