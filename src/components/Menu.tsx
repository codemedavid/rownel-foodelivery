import React from 'react';
import { MenuItem } from '../types';
import { useCategories } from '../hooks/useCategories';
import { useMerchant } from '../contexts/MerchantContext';
import { useCartContext } from '../contexts/CartContext';
import MenuItemCard from './MenuItemCard';
import MobileNav from './MobileNav';
import { ArrowLeft, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Preload images for better performance
const preloadImages = (items: MenuItem[]) => {
  items.forEach(item => {
    if (item.image) {
      const img = new Image();
      img.src = item.image;
    }
  });
};

interface MenuProps {
  menuItems: MenuItem[];
}

const fallbackDishSuggestions = [
  { id: 'fallback-dish-1', name: 'Chef Special Dumplings', description: 'Steamed dumplings with a savory pork and shrimp filling.' },
  { id: 'fallback-dish-2', name: 'Crispy Chili Chicken', description: 'Lightly battered chicken tossed in sweet chili glaze.' },
  { id: 'fallback-dish-3', name: 'Garlic Butter Noodles', description: 'Wok-tossed noodles with garlic, butter, and spring onions.' },
  { id: 'fallback-dish-4', name: 'Honey Soy Rice Bowl', description: 'Grilled protein over steamed rice with honey soy sauce.' },
  { id: 'fallback-dish-5', name: 'Salted Egg Prawns', description: 'Crispy prawns coated in rich and creamy salted egg sauce.' },
  { id: 'fallback-dish-6', name: 'Braised Beef Rice', description: 'Slow-braised beef served over warm jasmine rice.' },
  { id: 'fallback-dish-7', name: 'Mango Tapioca Cup', description: 'Chilled mango cream dessert with chewy tapioca pearls.' },
  { id: 'fallback-dish-8', name: 'Lemongrass Iced Tea', description: 'Refreshing house-brewed tea infused with lemongrass.' }
];

const Menu: React.FC<MenuProps> = ({ menuItems }) => {
  const navigate = useNavigate();
  const { selectedMerchant } = useMerchant();
  const { cartItems, updateQuantity } = useCartContext();
  const { categories } = useCategories(selectedMerchant?.id, menuItems);
  const [activeCategory, setActiveCategory] = React.useState('hot-coffee');
  const randomPicks = React.useMemo(() => {
    if (menuItems.length === 0) return [];
    const shuffled = [...menuItems].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(4, shuffled.length));
  }, [menuItems]);
  const randomFallbackPicks = React.useMemo(() => {
    const shuffled = [...fallbackDishSuggestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, []);

  // Preload images when menu items change
  React.useEffect(() => {
    if (menuItems.length > 0) {
      // Preload images for visible category first
      const visibleItems = menuItems.filter(item => item.category === activeCategory);
      preloadImages(visibleItems);
      
      // Then preload other images after a short delay
      setTimeout(() => {
        const otherItems = menuItems.filter(item => item.category !== activeCategory);
        preloadImages(otherItems);
      }, 1000);
    }
  }, [menuItems, activeCategory]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      const headerHeight = 64; // Header height
      const mobileNavHeight = 60; // Mobile nav height
      const offset = headerHeight + mobileNavHeight + 20; // Extra padding
      const elementPosition = element.offsetTop - offset;
      
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleOpenDetails = (itemId: string) => {
    if (!selectedMerchant) return;
    navigate(`/merchant/${selectedMerchant.id}/item/${itemId}`);
  };

  React.useEffect(() => {
    if (categories.length > 0) {
      // Set default to dim-sum if it exists, otherwise first category
      const defaultCategory = categories.find(cat => cat.id === 'dim-sum') || categories[0];
      if (!categories.find(cat => cat.id === activeCategory)) {
        setActiveCategory(defaultCategory.id);
      }
    }
  }, [categories, activeCategory]);

  React.useEffect(() => {
    const handleScroll = () => {
      const sections = [
        document.getElementById('random-picks'),
        ...categories.map(cat => document.getElementById(cat.id))
      ].filter(Boolean);
      const scrollPosition = window.scrollY + 200;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          if (i === 0) {
            setActiveCategory('random-picks');
          } else {
            setActiveCategory(categories[i - 1].id);
          }
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories]);

  if (!selectedMerchant) {
    return null;
  }

  return (
    <>
      {/* Merchant Header */}
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4 mb-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-700" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{selectedMerchant.name}</h1>
              <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                <div className="flex items-center">
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 mr-1" />
                  <span className="font-medium">{selectedMerchant.rating.toFixed(1)}</span>
                  <span className="ml-1">({selectedMerchant.totalReviews})</span>
                </div>
              </div>
            </div>
            {selectedMerchant.logoUrl && (
              <img
                src={selectedMerchant.logoUrl}
                alt={selectedMerchant.name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-gray-200"
              />
            )}
          </div>
          
          {selectedMerchant.description && (
            <p className="text-gray-600 text-sm ml-12">{selectedMerchant.description}</p>
          )}
        </div>
      </div>

      <MobileNav 
        activeCategory={activeCategory}
        onCategoryClick={handleCategoryClick}
        menuItems={menuItems}
        showRandomPicks
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section id="random-picks" className="mb-12">
          <div className="flex items-center mb-6">
            <span className="text-3xl mr-3">🎲</span>
            <h3 className="text-2xl font-bold text-gray-900">Random Picks</h3>
            <span className="ml-3 text-sm text-gray-500">(refresh for new dishes)</span>
          </div>

          {randomPicks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {randomPicks.map((item) => {
                const cartItem = cartItems.find(cartItem =>
                  cartItem.menuItemId === item.id &&
                  !cartItem.selectedVariation &&
                  (!cartItem.selectedAddOns || cartItem.selectedAddOns.length === 0)
                );
                return (
                  <MenuItemCard
                    key={`random-${item.id}`}
                    item={item}
                    quantity={cartItem?.quantity || 0}
                    cartItemId={cartItem?.id}
                    onUpdateQuantity={updateQuantity}
                    onOpenDetails={handleOpenDetails}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {randomFallbackPicks.map((dish) => (
                <div
                  key={dish.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-md"
                >
                  <div className="mb-2 inline-block rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                    Suggested
                  </div>
                  <h4 className="mb-2 text-lg font-semibold text-gray-900">{dish.name}</h4>
                  <p className="text-sm text-gray-600">{dish.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {categories.map((category) => {
          const categoryItems = menuItems.filter(item => item.category === category.id);
          
          if (categoryItems.length === 0) return null;
          
          return (
            <section key={category.id} id={category.id} className="mb-12">
              <div className="flex items-center mb-6">
                <span className="text-3xl mr-3">{category.icon}</span>
                <h3 className="text-2xl font-bold text-gray-900">{category.name}</h3>
                <span className="ml-3 text-sm text-gray-500">({categoryItems.length})</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {categoryItems.map((item) => {
                  const cartItem = cartItems.find(cartItem =>
                    cartItem.menuItemId === item.id &&
                    !cartItem.selectedVariation &&
                    (!cartItem.selectedAddOns || cartItem.selectedAddOns.length === 0)
                  );
                  return (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      quantity={cartItem?.quantity || 0}
                      cartItemId={cartItem?.id}
                      onUpdateQuantity={updateQuantity}
                      onOpenDetails={handleOpenDetails}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
};

export default Menu;
