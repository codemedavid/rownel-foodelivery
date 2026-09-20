import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { redirectTargetFor } from '../lib/roles';
import { colors } from '../theme';

/**
 * Sends each role to its own group: staff/admin to (admin), riders to (rider),
 * customers to the storefront. Redirects only when the signed-in identity/role
 * changes, so deep links such as /order/[id] keep working for everyone.
 */
export const RoleGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading, isRoleLoading, roleContext, viewAs } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const handledKeyRef = useRef<string | null>(null);

  const isReady = !isLoading && !isRoleLoading;
  // The previewed account is part of the identity: entering, switching or
  // leaving a "view as" preview must re-route to that role's landing screen.
  const identityKey = `${user?.id ?? 'guest'}:${roleContext.role}:${viewAs?.userId ?? ''}`;
  const topSegment = segments[0] as string | undefined;

  useEffect(() => {
    if (!isReady || handledKeyRef.current === identityKey) return;
    handledKeyRef.current = identityKey;

    const target = redirectTargetFor(roleContext.role, topSegment);
    if (target) router.replace(target);
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
