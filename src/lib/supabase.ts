import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string;
          merchant_id: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          icon: string;
          merchant_id: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string;
          merchant_id?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      merchants: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          logo_url: string | null;
          cover_image_url: string | null;
          category: string;
          cuisine_type: string | null;
          delivery_fee: number;
          base_delivery_fee: number;
          delivery_fee_per_km: number;
          min_delivery_fee: number | null;
          max_delivery_fee: number | null;
          max_delivery_distance_km: number | null;
          minimum_order: number;
          estimated_delivery_time: string | null;
          rating: number;
          total_reviews: number;
          active: boolean;
          featured: boolean;
          address: string | null;
          formatted_address: string | null;
          latitude: number | null;
          longitude: number | null;
          osm_place_id: string | null;
          contact_number: string | null;
          email: string | null;
          opening_hours: Record<string, string> | null;
          payment_methods: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          logo_url?: string | null;
          cover_image_url?: string | null;
          category: string;
          cuisine_type?: string | null;
          delivery_fee?: number;
          base_delivery_fee?: number;
          delivery_fee_per_km?: number;
          min_delivery_fee?: number | null;
          max_delivery_fee?: number | null;
          max_delivery_distance_km?: number | null;
          minimum_order?: number;
          estimated_delivery_time?: string | null;
          rating?: number;
          total_reviews?: number;
          active?: boolean;
          featured?: boolean;
          address?: string | null;
          formatted_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          osm_place_id?: string | null;
          contact_number?: string | null;
          email?: string | null;
          opening_hours?: Record<string, string> | null;
          payment_methods?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          logo_url?: string | null;
          cover_image_url?: string | null;
          category?: string;
          cuisine_type?: string | null;
          delivery_fee?: number;
          base_delivery_fee?: number;
          delivery_fee_per_km?: number;
          min_delivery_fee?: number | null;
          max_delivery_fee?: number | null;
          max_delivery_distance_km?: number | null;
          minimum_order?: number;
          estimated_delivery_time?: string | null;
          rating?: number;
          total_reviews?: number;
          active?: boolean;
          featured?: boolean;
          address?: string | null;
          formatted_address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          osm_place_id?: string | null;
          contact_number?: string | null;
          email?: string | null;
          opening_hours?: Record<string, string> | null;
          payment_methods?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      menu_items: {
        Row: {
          id: string;
          name: string;
          description: string;
          base_price: number;
          category: string;
          popular: boolean;
          available: boolean;
          image_url: string | null;
          discount_price: number | null;
          discount_start_date: string | null;
          discount_end_date: string | null;
          discount_active: boolean;
          merchant_id: string;
          created_at: string;
          updated_at: string;
          track_inventory: boolean;
          stock_quantity: number | null;
          low_stock_threshold: number;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          base_price: number;
          category: string;
          popular?: boolean;
          available?: boolean;
          image_url?: string | null;
          discount_price?: number | null;
          discount_start_date?: string | null;
          discount_end_date?: string | null;
          discount_active?: boolean;
          merchant_id: string;
          created_at?: string;
          updated_at?: string;
          track_inventory?: boolean;
          stock_quantity?: number | null;
          low_stock_threshold?: number;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          base_price?: number;
          category?: string;
          popular?: boolean;
          available?: boolean;
          image_url?: string | null;
          discount_price?: number | null;
          discount_start_date?: string | null;
          discount_end_date?: string | null;
          discount_active?: boolean;
          merchant_id?: string;
          created_at?: string;
          updated_at?: string;
          track_inventory?: boolean;
          stock_quantity?: number | null;
          low_stock_threshold?: number;
        };
      };
      variations: {
        Row: {
          id: string;
          menu_item_id: string;
          name: string;
          price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          name: string;
          price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          name?: string;
          price?: number;
          created_at?: string;
        };
      };
      add_ons: {
        Row: {
          id: string;
          menu_item_id: string;
          name: string;
          price: number;
          category: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          name: string;
          price: number;
          category: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          name?: string;
          price?: number;
          category?: string;
          created_at?: string;
        };
      };
      payment_methods: {
        Row: {
          id: string;
          name: string;
          account_number: string;
          account_name: string;
          qr_code_url: string;
          merchant_id: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          account_number: string;
          account_name: string;
          qr_code_url: string;
          merchant_id?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          account_number?: string;
          account_name?: string;
          qr_code_url?: string;
          merchant_id?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      site_settings: {
        Row: {
          id: string;
          value: string;
          type: string;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          value: string;
          type?: string;
          description?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          value?: string;
          type?: string;
          description?: string | null;
          updated_at?: string;
        };
      };
      promotions: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          cta_text: string | null;
          cta_link: string | null;
          banner_image_url: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          cta_text?: string | null;
          cta_link?: string | null;
          banner_image_url?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          subtitle?: string | null;
          cta_text?: string | null;
          cta_link?: string | null;
          banner_image_url?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          merchant_id: string;
          customer_name: string;
          contact_number: string;
          service_type: 'dine-in' | 'pickup' | 'delivery';
          address: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          distance_km: number | null;
          delivery_fee: number | null;
          delivery_fee_breakdown: Record<string, unknown> | null;
          pickup_time: string | null;
          party_size: number | null;
          dine_in_time: string | null;
          payment_method: string;
          reference_number: string | null;
          notes: string | null;
          total: number;
          status: string;
          ip_address: string | null;
          receipt_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          customer_name: string;
          contact_number: string;
          service_type: 'dine-in' | 'pickup' | 'delivery';
          address?: string | null;
          delivery_latitude?: number | null;
          delivery_longitude?: number | null;
          distance_km?: number | null;
          delivery_fee?: number | null;
          delivery_fee_breakdown?: Record<string, unknown> | null;
          pickup_time?: string | null;
          party_size?: number | null;
          dine_in_time?: string | null;
          payment_method: string;
          reference_number?: string | null;
          notes?: string | null;
          total: number;
          status?: string;
          ip_address?: string | null;
          receipt_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          merchant_id?: string;
          customer_name?: string;
          contact_number?: string;
          service_type?: 'dine-in' | 'pickup' | 'delivery';
          address?: string | null;
          delivery_latitude?: number | null;
          delivery_longitude?: number | null;
          distance_km?: number | null;
          delivery_fee?: number | null;
          delivery_fee_breakdown?: Record<string, unknown> | null;
          pickup_time?: string | null;
          party_size?: number | null;
          dine_in_time?: string | null;
          payment_method?: string;
          reference_number?: string | null;
          notes?: string | null;
          total?: number;
          status?: string;
          ip_address?: string | null;
          receipt_url?: string | null;
          created_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          item_id: string;
          name: string;
          variation: any | null;
          add_ons: any | null;
          unit_price: number;
          quantity: number;
          subtotal: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          item_id: string;
          name: string;
          variation?: any | null;
          add_ons?: any | null;
          unit_price: number;
          quantity: number;
          subtotal: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          item_id?: string;
          name?: string;
          variation?: any | null;
          add_ons?: any | null;
          unit_price?: number;
          quantity?: number;
          subtotal?: number;
          created_at?: string;
        };
      };
    };
  };
};
