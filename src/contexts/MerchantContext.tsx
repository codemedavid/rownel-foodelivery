import React, { createContext, useContext, useState, useEffect } from 'react';
import { Merchant } from '../types';
import { useMerchants } from '../hooks/useMerchants';

interface MerchantContextType {
  selectedMerchant: Merchant | null;
  merchants: Merchant[];
  loading: boolean;
  setSelectedMerchant: (merchant: Merchant | null) => void;
  selectMerchantById: (merchantId: string) => void;
  clearMerchant: () => void;
}

const MerchantContext = createContext<MerchantContextType | undefined>(undefined);

export const useMerchant = () => {
  const context = useContext(MerchantContext);
  if (context === undefined) {
    throw new Error('useMerchant must be used within a MerchantProvider');
  }
  return context;
};

interface MerchantProviderProps {
  children: React.ReactNode;
}

export const MerchantProvider: React.FC<MerchantProviderProps> = ({ children }) => {
  const { merchants, loading, getMerchantById } = useMerchants();
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);

  // Load selected merchant from localStorage on mount
  useEffect(() => {
    const savedMerchantId = localStorage.getItem('selectedMerchantId');
    if (savedMerchantId && merchants.length > 0) {
      const merchant = merchants.find(m => m.id === savedMerchantId);
      if (merchant) {
        setSelectedMerchant(merchant);
      }
    }
  }, [merchants]);

  const selectMerchantById = async (merchantId: string) => {
    try {
      const merchant = await getMerchantById(merchantId);
      if (merchant) {
        setSelectedMerchant(merchant);
        localStorage.setItem('selectedMerchantId', merchantId);
      }
    } catch (error) {
      console.error('Error selecting merchant:', error);
    }
  };

  const clearMerchant = () => {
    setSelectedMerchant(null);
    localStorage.removeItem('selectedMerchantId');
  };

  const value = {
    selectedMerchant,
    merchants,
    loading,
    setSelectedMerchant,
    selectMerchantById,
    clearMerchant,
  };

  return (
    <MerchantContext.Provider value={value}>
      {children}
    </MerchantContext.Provider>
  );
};

