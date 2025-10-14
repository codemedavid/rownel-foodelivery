import React from 'react';
import { ShoppingCart, Search, Heart } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useNavigate } from 'react-router-dom';
import { useCartContext } from '../contexts/CartContext';

interface HeaderProps {
  onCartClick: () => void;
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onCartClick }) => {
  const navigate = useNavigate();
  const { siteSettings, loading } = useSiteSettings();
  const { getTotalItems } = useCartContext();
  const cartItemsCount = getTotalItems();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Site Name */}
          <button 
            onClick={() => navigate('/')}
            className="flex items-center space-x-3 text-black hover:opacity-80 transition-opacity duration-200"
          >
            {loading ? (
              <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
            ) : (
              <img 
                src={siteSettings?.site_logo || "/logo.jpg"} 
                alt={siteSettings?.site_name || "Row-Nel FooDelivery"}
                className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                onError={(e) => {
                  e.currentTarget.src = "/logo.jpg";
                }}
              />
            )}
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold italic">
                {loading ? (
                  <div className="w-24 h-6 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <>
                    <span className="text-gray-900">{siteSettings?.site_name?.split(' ')[0] || "Row-Nel"}</span>
                    <span className="text-yellow-brand"> {siteSettings?.site_name?.split(' ')[1] || "FooDelivery"}</span>
                  </>
                )}
              </h1>
              <p className="text-xs text-gray-500 hidden lg:block">Food Delivery</p>
            </div>
          </button>
          
          {/* Actions */}
          <div className="flex items-center space-x-2">
            {/* Search Button (Mobile) */}
            <button className="md:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
              <Search className="h-5 w-5" />
            </button>
            
            {/* Favorites Button */}
            <button className="hidden sm:block relative p-2 text-gray-700 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
              <Heart className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                3
              </span>
            </button>
            
            {/* Cart Button */}
            <button 
              onClick={onCartClick}
              className="relative p-2 text-gray-700 hover:text-green-600 hover:bg-green-50 rounded-full transition-all"
            >
              <ShoppingCart className="h-6 w-6" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg animate-bounce">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
