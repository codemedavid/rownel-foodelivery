import React, { useState } from 'react';
import { ArrowLeft, Edit, Plus, Save, Trash2, X, Image } from 'lucide-react';
import ImageUpload from './ImageUpload';
import { Promotion, usePromotions } from '../hooks/usePromotions';

interface PromotionManagerProps {
  onBack: () => void;
}

type FormData = {
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  banner_image_url: string;
  active: boolean;
  sort_order: number;
};

const PromotionManager: React.FC<PromotionManagerProps> = ({ onBack }) => {
  const { promotions, addPromotion, updatePromotion, deletePromotion, refetchAll } = usePromotions();
  const [currentView, setCurrentView] = useState<'list' | 'add' | 'edit'>('list');
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    subtitle: '',
    cta_text: 'Order Now',
    cta_link: '/',
    banner_image_url: '',
    active: true,
    sort_order: 0,
  });

  React.useEffect(() => {
    refetchAll();
  }, []);

  const handleAddPromotion = () => {
    const nextSortOrder = Math.max(...promotions.map((p) => p.sort_order), 0) + 1;
    setEditingPromotion(null);
    setFormData({
      title: '',
      subtitle: '',
      cta_text: 'Order Now',
      cta_link: '/',
      banner_image_url: '',
      active: true,
      sort_order: nextSortOrder,
    });
    setCurrentView('add');
  };

  const handleEditPromotion = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setFormData({
      title: promotion.title,
      subtitle: promotion.subtitle || '',
      cta_text: promotion.cta_text || '',
      cta_link: promotion.cta_link || '',
      banner_image_url: promotion.banner_image_url || '',
      active: promotion.active,
      sort_order: promotion.sort_order,
    });
    setCurrentView('edit');
  };

  const handleDeletePromotion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;

    try {
      await deletePromotion(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete promotion');
    }
  };

  const handleSavePromotion = async () => {
    if (!formData.title.trim()) {
      alert('Please provide a promotion title');
      return;
    }

    try {
      if (editingPromotion) {
        await updatePromotion(editingPromotion.id, {
          ...formData,
          title: formData.title.trim(),
          subtitle: formData.subtitle.trim() || null,
          cta_text: formData.cta_text.trim() || null,
          cta_link: formData.cta_link.trim() || null,
          banner_image_url: formData.banner_image_url.trim() || null,
        });
      } else {
        await addPromotion({
          ...formData,
          title: formData.title.trim(),
          subtitle: formData.subtitle.trim() || null,
          cta_text: formData.cta_text.trim() || null,
          cta_link: formData.cta_link.trim() || null,
          banner_image_url: formData.banner_image_url.trim() || null,
        });
      }

      setCurrentView('list');
      setEditingPromotion(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save promotion');
    }
  };

  const handleCancel = () => {
    setCurrentView('list');
    setEditingPromotion(null);
  };

  if (currentView === 'add' || currentView === 'edit') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleCancel}
                  className="flex items-center space-x-2 text-gray-600 hover:text-black transition-colors duration-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back</span>
                </button>
                <h1 className="text-2xl font-playfair font-semibold text-black">
                  {currentView === 'add' ? 'Add Promotion' : 'Edit Promotion'}
                </h1>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSavePromotion}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-black mb-2">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g. Spicy Zone"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-2">Subtitle</label>
              <input
                type="text"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g. Up to 40% OFF"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-black mb-2">CTA Text</label>
                <input
                  type="text"
                  value={formData.cta_text}
                  onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Order Now"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-2">CTA Link</label>
                <input
                  type="text"
                  value={formData.cta_link}
                  onChange={(e) => setFormData({ ...formData, cta_link: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="/ or https://example.com"
                />
              </div>
            </div>

            <div>
              <ImageUpload
                currentImage={formData.banner_image_url}
                onImageChange={(imageUrl) => setFormData({ ...formData, banner_image_url: imageUrl || '' })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-black mb-2">Sort Order</label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) || 0 })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers appear first in the carousel.</p>
            </div>

            <div className="flex items-center">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-medium text-black">Active Promotion</span>
              </label>
            </div>
          </div>
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
                <span>Dashboard</span>
              </button>
              <h1 className="text-2xl font-playfair font-semibold text-black">Promotions</h1>
            </div>
            <button
              onClick={handleAddPromotion}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200"
            >
              <Plus className="h-4 w-4" />
              <span>Add Promotion</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-playfair font-medium text-black mb-4">Promotion Banners</h2>

            {promotions.length === 0 ? (
              <div className="text-center py-10">
                <Image className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No promotions found</p>
                <button
                  onClick={handleAddPromotion}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200"
                >
                  Add First Promotion
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {promotions.map((promotion) => (
                  <div key={promotion.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        {promotion.banner_image_url ? (
                          <img
                            src={promotion.banner_image_url}
                            alt={promotion.title}
                            className="w-full h-40 object-cover rounded-lg mb-3"
                          />
                        ) : (
                          <div className="w-full h-40 rounded-lg mb-3 bg-gradient-to-r from-green-700 to-green-900" />
                        )}
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{promotion.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{promotion.subtitle || 'No subtitle'}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          CTA: {promotion.cta_text || 'None'} | Link: {promotion.cta_link || 'None'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Sort: {promotion.sort_order} | Status: {promotion.active ? 'Active' : 'Inactive'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditPromotion(promotion)}
                          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                        >
                          <Edit className="h-4 w-4" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeletePromotion(promotion.id)}
                          className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromotionManager;
