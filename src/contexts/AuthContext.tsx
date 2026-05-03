import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { useQuery } from 'convex/react';
import { supabase } from '../lib/supabase';
import { api } from '../../convex/_generated/api';
import { isAdminUser, isRiderUser, isStaffUser } from '../lib/authRoles';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
  isAdmin: boolean;
  isStaff: boolean;
  isRider: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySession = (next: Session | null) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.error('Error getting session:', error);
        applySession(data.session ?? null);
      })
      .catch((err) => {
        console.error('Error getting session:', err);
        applySession(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, next) => applySession(next)
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }, []);

  const staffRecord = useQuery(
    api.staff.getBySupabaseUser,
    user ? { supabaseUserId: user.id } : 'skip',
  );

  const value = useMemo<AuthContextType>(() => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
    const staffIsAdmin = !!(staffRecord?.isActive && staffRecord?.allMerchants);
    const isAdmin = staffIsAdmin || isAdminUser(user, adminEmail);
    const isStaff = staffIsAdmin || !!staffRecord?.isActive || isStaffUser(user);
    const isRider = isRiderUser(user);

    return {
      user,
      session,
      loading,
      signIn,
      signOut,
      changePassword,
      isAdmin,
      isStaff,
      isRider,
    };
  }, [user, session, loading, signIn, signOut, changePassword, staffRecord]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
