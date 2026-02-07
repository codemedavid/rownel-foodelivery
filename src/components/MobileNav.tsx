import React from 'react';
import { useCategories } from '../hooks/useCategories';
import { useMerchant } from '../contexts/MerchantContext';

interface MobileNavProps {
  activeCategory: string;
  onCategoryClick: (categoryId: string) => void;
  menuItems?: any[];
  showRandomPicks?: boolean;
}

const MobileNav: React.FC<MobileNavProps> = ({
  activeCategory,
  onCategoryClick,
  menuItems,
  showRandomPicks = false
}) => {
  const { selectedMerchant } = useMerchant();
  const { categories } = useCategories(selectedMerchant?.id, menuItems);

  return (
    <div className="sticky top-16 z-40 bg-white/95 backdrop-blur-sm border-b border-red-200 md:hidden shadow-sm">
      <div className="flex overflow-x-auto scrollbar-hide px-4 py-3">
        {showRandomPicks && (
          <button
            onClick={() => onCategoryClick('random-picks')}
            className={`flex-shrink-0 flex items-center space-x-2 px-4 py-2 rounded-full mr-3 transition-all duration-200 ${
              activeCategory === 'random-picks'
                ? 'bg-red-600 text-white'
                : 'bg-yellow-100 text-gray-700 hover:bg-yellow-200'
            }`}
          >
            <span className="text-lg">🎲</span>
            <span className="text-sm font-medium whitespace-nowrap">Random Picks</span>
          </button>
        )}
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryClick(category.id)}
            className={`flex-shrink-0 flex items-center space-x-2 px-4 py-2 rounded-full mr-3 transition-all duration-200 ${
              activeCategory === category.id
                ? 'bg-red-600 text-white'
                : 'bg-yellow-100 text-gray-700 hover:bg-yellow-200'
            }`}
          >
            <span className="text-lg">{category.icon}</span>
            <span className="text-sm font-medium whitespace-nowrap">{category.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileNav;
