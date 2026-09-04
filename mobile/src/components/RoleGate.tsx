import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { isOperationalRole, landingRouteFor } from '../lib/roles';
import { colors } from '../theme';

const ADMIN_GROUP = '(admin)';
const CUSTOMER_GROUP = '(tabs)';

/**
 * Sends staff/admin to the admin group and customers back to the storefront.
 * Redirects only when the signed-in identity/role changes, so deep links such
 * as /order/[id] keep working for everyone.
 */
export const RoleGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, isRoleLoading, roleContext } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const handledKeyRef = useRef<string | null>(null);

  const isReady = !isLoading && !isRoleLoading;
  const identityKey = `${user?.id ?? 'guest'}:${roleContext.role}`;
  const topSegment = segments[0] as string | undefined;

  useEffect(() => {
    if (!isReady || handledKeyRef.current === identityKey) return;
    handledKeyRef.current = identityKey;

    const isOperational = isOperationalRole(roleContext.role);
    const inAdmin = topSegment === ADMIN_GROUP;
    const inCustomer = topSegment === CUSTOMER_GROUP || topSegment === undefined;

    if (isOperational && inCustomer) {
      router.replace(landingRouteFor(roleContext.role));
    } else if (!isOperational && inAdmin) {
      router.replace(landingRouteFor(roleContext.role));
    }
  }, [isReady, identityKey, roleContext.role, topSegment, router]);

  if (!isReady && handledKeyRef.current === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  return <>{children}</>;
};

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
