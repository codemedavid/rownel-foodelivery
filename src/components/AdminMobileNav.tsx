import React from 'react';
import {
  BarChart3,
  Bike,
  ClipboardList,
  Coffee,
  LayoutDashboard,
  Package,
  Settings,
  Store,
  Tag,
  Users,
} from 'lucide-react';

export type AdminSection =
  | 'dashboard'
  | 'orders'
  | 'items'
  | 'inventory'
  | 'merchants'
  | 'riders'
  | 'staff'
  | 'promotions'
  | 'earnings'
  | 'settings';

interface AdminMobileNavProps {
  currentView: string;
  onSelect: (section: AdminSection) => void;
}

const SECTIONS: Array<{ key: AdminSection; label: string; icon: React.ElementType }> = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { key: 'orders', label: 'Orders', icon: ClipboardList },
  { key: 'items', label: 'Menu Items', icon: Coffee },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'merchants', label: 'Merchants', icon: Store },
  { key: 'riders', label: 'Riders', icon: Bike },
  { key: 'staff', label: 'Staff', icon: Users },
  { key: 'promotions', label: 'Promos', icon: Tag },
  { key: 'earnings', label: 'Earnings', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

/**
 * Horizontally scrollable section switcher so the whole admin dashboard is
 * reachable in one tap on a phone (the desktop hub cards remain unchanged).
 */
const AdminMobileNav: React.FC<AdminMobileNavProps> = ({ currentView, onSelect }) => {
  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 md:hidden shadow-sm">
      <div className="flex overflow-x-auto scrollbar-hide px-4 py-2">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const isActive = currentView === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(key)}
              className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-full mr-2 text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AdminMobileNav;
