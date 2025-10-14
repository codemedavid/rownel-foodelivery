import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Star, MapPin, Truck, Search, Heart, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { useMerchant } from '../contexts/MerchantContext';

const MerchantsList: React.FC = () => {
  const navigate = useNavigate();
  const { merchants, loading, selectMerchantById } = useMerchant();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const categories = [
    { id: 'all', name: 'All', icon: '🍽️' },
    { id: 'restaurant', name: 'Restaurants', icon: '🍴' },
    { id: 'cafe', name: 'Cafes', icon: '☕' },
    { id: 'fast-food', name: 'Fast Food', icon: '🍔' },
    { id: 'bakery', name: 'Bakery', icon: '🥖' },
    { id: 'dessert', name: 'Desserts', icon: '🍰' },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'restaurant':
        return '🍴';
      case 'cafe':
        return '☕';
      case 'fast-food':
        return '🍔';
      case 'bakery':
      case 'dessert':
        return '🍰';
      default:
        return '🍽️';
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= Math.round(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-xs text-gray-600">({rating.toFixed(1)})</span>
      </div>
    );
  };

  const filteredMerchants = useMemo(() => {
    return merchants.filter(merchant => {
      const matchesSearch = merchant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          merchant.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || merchant.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [merchants, searchQuery, selectedCategory]);

  const featuredMerchants = filteredMerchants.filter(m => m.featured);
  const regularMerchants = filteredMerchants.filter(m => !m.featured);

  const handleMerchantClick = (merchantId: string) => {
    selectMerchantById(merchantId);
    navigate(`/merchant/${merchantId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#282c34' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-brand mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading amazing restaurants...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Brand Colors */}
      <div className="text-white shadow-lg bg-green-900" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Brand Logo/Title */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="text-4xl font-bold italic">
                <span className="text-white">Row-Nel</span>
                <span className="text-yellow-brand"> FooDelivery</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button className="relative hover:opacity-80 transition-opacity">
                <Heart className="h-6 w-6 text-green-600" />
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  3
                </span>
              </button>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center space-x-2 mb-4">
              <MapPin className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-gray-200">Your Location</span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>

          {/* Greeting */}
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-white">
            Hello! 👋
          </h1>
          <p className="text-gray-200 text-lg">
            {merchants.length} amazing restaurants near you
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 mb-6">
        <div className="bg-white rounded-2xl shadow-xl p-4 border border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search for restaurants, cuisines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border-0 focus:ring-2 focus:ring-green-600 focus:bg-white transition-all"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-3 bg-gray-50 rounded-xl hover:bg-green-600 hover:text-white transition-all"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`flex-shrink-0 flex flex-col items-center space-y-2 px-6 py-3 rounded-2xl transition-all ${
                selectedCategory === category.id
                  ? 'bg-gradient-to-br from-green-600 to-green-700 text-white shadow-lg scale-105 font-bold'
                  : 'bg-white text-gray-700 hover:bg-green-50 border border-gray-100'
              }`}
            >
              <span className="text-2xl">{category.icon}</span>
              <span className="text-sm font-medium whitespace-nowrap">{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Featured Section */}
      {featuredMerchants.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <Star className="h-6 w-6 text-green-600 mr-2 fill-green-600" />
                Featured Restaurants
              </h2>
              <p className="text-gray-600 text-sm mt-1">Handpicked for you</p>
            </div>
            <button className="text-green-600 hover:text-green-700 font-medium flex items-center">
              See all <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredMerchants.map((merchant) => (
              <div
                key={merchant.id}
                onClick={() => handleMerchantClick(merchant.id)}
                className="bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden cursor-pointer transform hover:-translate-y-2 group"
              >
                <div className="relative h-48 overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #282c34, #3a3f4b)' }}>
                  {merchant.coverImageUrl ? (
                    <img
                      src={merchant.coverImageUrl}
                      alt={merchant.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-yellow-brand text-6xl">
                      {getCategoryIcon(merchant.category)}
                    </div>
                  )}
                  <div className="absolute top-4 left-4 bg-gradient-to-r from-green-600 to-green-700 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center shadow-lg">
                    <Star className="h-3 w-3 mr-1 fill-white" />
                    Featured
                  </div>
                  <button className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-2 rounded-full hover:bg-white transition-colors">
                    <Heart className="h-5 w-5 text-gray-700 hover:text-red-500" />
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-bold text-gray-900 line-clamp-1">
                      {merchant.name}
                    </h3>
                    {merchant.logoUrl && (
                      <img
                        src={merchant.logoUrl}
                        alt={merchant.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                      />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {merchant.description}
                  </p>
                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-gray-600 capitalize">{merchant.category}</span>
                    {renderStars(merchant.rating)}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>{merchant.estimatedDeliveryTime || '30-45 min'}</span>
                    </div>
                    <div className="flex items-center text-sm font-bold text-green-600">
                      <Truck className="h-4 w-4 mr-1" />
                      ₱{merchant.deliveryFee}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Restaurants */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">All Restaurants</h2>
            <p className="text-gray-600 text-sm mt-1">{regularMerchants.length} restaurants available</p>
          </div>
          <button className="text-green-brand hover:text-green-brand-dark font-medium flex items-center">
            See all <ChevronRight className="h-4 w-4 ml-1" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {regularMerchants.map((merchant) => (
            <div
              key={merchant.id}
              onClick={() => handleMerchantClick(merchant.id)}
              className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer transform hover:-translate-y-1 group"
            >
              <div className="relative h-40 overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #282c34, #3a3f4b)' }}>
                {merchant.coverImageUrl ? (
                  <img
                    src={merchant.coverImageUrl}
                    alt={merchant.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-yellow-brand text-5xl">
                    {getCategoryIcon(merchant.category)}
                  </div>
                )}
                <button className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm p-2 rounded-full hover:bg-white transition-colors">
                  <Heart className="h-4 w-4 text-gray-700 hover:text-red-500" />
                </button>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-1 line-clamp-1">
                  {merchant.name}
                </h3>
                <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                  <span className="capitalize">{merchant.category}</span>
                  <div className="flex items-center">
                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                    <span className="ml-1">{merchant.rating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                  <span className="text-gray-600">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {merchant.estimatedDeliveryTime || '30-45 min'}
                  </span>
                  <span className="font-bold text-green-600">₱{merchant.deliveryFee}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredMerchants.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              No restaurants found
            </h3>
            <p className="text-gray-600 mb-6">
              Try adjusting your search or filters
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all font-medium shadow-lg"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Bottom Spacing */}
      <div className="h-20"></div>
    </div>
  );
};

export default MerchantsList;
