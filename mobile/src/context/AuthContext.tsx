import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { deriveRoleContext, GUEST_ROLE_CONTEXT, type RoleContext } from '../lib/roles';
import {
  canViewAs,
  effectiveRoleContext,
  effectiveUserId as resolveEffectiveUserId,
  type ViewAsTarget,
} from '../lib/viewAs';
import type { StaffRecord } from '../lib/adminTypes';
import { notificationsApi } from '../lib/notificationsApi';
import { useStaffRecord } from '../hooks/useStaffRecord';
import { usePushRegistration } from '../hooks/usePushRegistration';

const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  /** True until the staff row has been checked for the signed-in user. */
  isRoleLoading: boolean;
  /** Role the app behaves with — the previewed account's while viewing as. */
  roleContext: RoleContext;
  /** Role of the actually signed-in account, ignoring any preview. */
  realRoleContext: RoleContext;
  /** Account currently being previewed by an admin, if any. */
  viewAs: ViewAsTarget | null;
  isViewingAs: boolean;
  /** User id every per-user query should key off (the previewed one while viewing as). */
  effectiveUserId: string | null;
  /** Admin-only. Starts a read-only preview of another account. */
  startViewAs: (target: ViewAsTarget) => void;
  stopViewAs: () => void;
  staffRecord: StaffRecord | null;
  /** True when this device holds a registered Expo push token. */
  isPushAvailable: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewAs, setViewAs] = useState<ViewAsTarget | null>(null);

  const userId = user?.id ?? null;
  const { staffRecord, isLoading: isRoleLoading, refetch: refreshRole } = useStaffRecord(userId);
  const { pushTokenRef, isPushAvailable } = usePushRegistration(userId);

  useEffect(() => {
    let mounted = true;

    const applySession = (next: Session | null) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);
      setIsLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session ?? null))
      .catch(() => applySession(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => applySession(next));

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    setViewAs(null);
    const token = pushTokenRef.current;
    if (token) {
      try {
        await notificationsApi.deletePushToken(token);
      } catch (err) {
        if (__DEV__) console.warn('Push token cleanup failed:', err);
      }
    }
    await supabase.auth.signOut();
  }, [pushTokenRef]);

  const realRoleContext = useMemo(
    () => (user ? deriveRoleContext(user, staffRecord, ADMIN_EMAIL) : GUEST_ROLE_CONTEXT),
    [user, staffRecord]
  );

  // A preview must never outlive the admin session that opened it.
  useEffect(() => {
    if (viewAs && !canViewAs(realRoleContext)) setViewAs(null);
  }, [viewAs, realRoleContext]);

  const startViewAs = useCallback(
    (target: ViewAsTarget) => {
      if (!canViewAs(realRoleContext)) return;
      setViewAs(target);
    },
    [realRoleContext]
  );

  const stopViewAs = useCallback(() => setViewAs(null), []);

  const roleContext = useMemo(
    () => effectiveRoleContext(realRoleContext, viewAs),
    [realRoleContext, viewAs]
  );
  const isViewingAs = roleContext !== realRoleContext;
  const effectiveUserId = resolveEffectiveUserId(userId, isViewingAs ? viewAs : null);

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isRoleLoading,
      roleContext,
      realRoleContext,
      viewAs: isViewingAs ? viewAs : null,
      isViewingAs,
      effectiveUserId,
      startViewAs,
      stopViewAs,
      staffRecord,
      isPushAvailable,
      signIn,
      signUp,
      signOut,
      refreshRole,
    }),
    [
      user,
      session,
      isLoading,
      isRoleLoading,
      roleContext,
      realRoleContext,
      viewAs,
      isViewingAs,
      effectiveUserId,
      startViewAs,
      stopViewAs,
      staffRecord,
      isPushAvailable,
      signIn,
      signUp,
      signOut,
      refreshRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
