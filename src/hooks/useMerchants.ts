import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Merchant } from '../types';

export const useMerchants = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMerchants = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('merchants')
        .select('*')
        .eq('active', true)
        .order('featured', { ascending: false })
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;

      const formattedMerchants: Merchant[] = (data || []).map((merchant) => ({
        id: merchant.id,
        name: merchant.name,
        description: merchant.description,
        logoUrl: merchant.logo_url,
        coverImageUrl: merchant.cover_image_url,
        category: merchant.category,
        cuisineType: merchant.cuisine_type,
        deliveryFee: merchant.delivery_fee,
        minimumOrder: merchant.minimum_order,
        estimatedDeliveryTime: merchant.estimated_delivery_time,
        rating: merchant.rating,
        totalReviews: merchant.total_reviews,
        active: merchant.active,
        featured: merchant.featured,
        address: merchant.address,
        contactNumber: merchant.contact_number,
        email: merchant.email,
        openingHours: merchant.opening_hours,
        paymentMethods: merchant.payment_methods,
        createdAt: merchant.created_at,
        updatedAt: merchant.updated_at,
      }));

      setMerchants(formattedMerchants);
      setError(null);
    } catch (err) {
      console.error('Error fetching merchants:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch merchants');
    } finally {
      setLoading(false);
    }
  };

  const getMerchantById = async (id: string): Promise<Merchant | null> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', id)
        .eq('active', true)
        .single();

      if (fetchError) throw fetchError;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        logoUrl: data.logo_url,
        coverImageUrl: data.cover_image_url,
        category: data.category,
        cuisineType: data.cuisine_type,
        deliveryFee: data.delivery_fee,
        minimumOrder: data.minimum_order,
        estimatedDeliveryTime: data.estimated_delivery_time,
        rating: data.rating,
        totalReviews: data.total_reviews,
        active: data.active,
        featured: data.featured,
        address: data.address,
        contactNumber: data.contact_number,
        email: data.email,
        openingHours: data.opening_hours,
        paymentMethods: data.payment_methods,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (err) {
      console.error('Error fetching merchant:', err);
      return null;
    }
  };

  useEffect(() => {
    fetchMerchants();
  }, []);

  return {
    merchants,
    loading,
    error,
    refetch: fetchMerchants,
    getMerchantById,
  };
};

