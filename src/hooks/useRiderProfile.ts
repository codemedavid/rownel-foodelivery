import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  plate_number: string;
  vehicle_type: 'motorcycle' | 'bicycle' | 'car';
  photo_url: string | null;
  is_approved: boolean;
  is_active: boolean;
  rating_sum: number;
  rating_count: number;
  payment_mode: 'fixed' | 'percentage' | null;
  payment_value: number | null;
}

export interface RiderSettings {
  default_payment_mode: 'fixed' | 'percentage';
  default_payment_value: number;
  offer_radius_km: number;
  offer_expiry_seconds: number;
  max_concurrent_offers: number;
  location_stale_seconds: number;
}

export function useRiderProfile() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) console.error('rider profile load failed', error);
    setProfile((data as RiderProfile) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // Wait for Supabase to restore the session from storage before deciding
    // whether the user is logged out — otherwise a refresh briefly sees
    // user=null and ProtectedRiderRoute kicks them back to /rider/login.
    if (authLoading) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!userId) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data, error } = await supabase
        .from('riders')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error('rider profile load failed', error);
      setProfile((data as RiderProfile) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const updateProfile = useCallback(async (updates: Partial<Pick<RiderProfile, 'name' | 'phone' | 'photo_url'>>) => {
    if (!userId) throw new Error('Not authenticated');
    const { error } = await supabase.from('riders').update(updates).eq('id', userId);
    if (error) throw error;
    await refresh();
  }, [userId, refresh]);

  return { profile, loading, refresh, updateProfile };
}

export function ratingAverage(profile: Pick<RiderProfile, 'rating_sum' | 'rating_count'> | null): number | null {
  if (!profile || profile.rating_count === 0) return null;
  return profile.rating_sum / profile.rating_count;
}

export async function fetchRiderById(id: string): Promise<RiderProfile | null> {
  const { data } = await supabase.from('riders').select('*').eq('id', id).maybeSingle();
  return (data as RiderProfile) ?? null;
}

export async function fetchRiderSettings(): Promise<RiderSettings | null> {
  const { data } = await supabase.from('rider_settings').select('*').eq('id', 1).maybeSingle();
  return (data as RiderSettings) ?? null;
}
