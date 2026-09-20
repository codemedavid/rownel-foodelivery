import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useRiderProfile } from '../../src/hooks/useRiderProfile';
import { useRiderPresence } from '../../src/hooks/useRiderPresence';
import { colors, radius, spacing } from '../../src/theme';
import { Badge, Button, EmptyState } from '../../src/components/ui';

const PRESENCE_COLORS = {
  available: { color: colors.success, bg: '#dcfce7' },
  busy: { color: '#b45309', bg: '#fef3c7' },
  offline: { color: colors.textSecondary, bg: '#f3f4f6' },
} as const;

export default function RiderProfileScreen() {
  const { user, signOut, effectiveUserId, isViewingAs, stopViewAs } = useAuth();
  const { profile, isLoading, refetch } = useRiderProfile(effectiveUserId);
  const { presence } = useRiderPresence(effectiveUserId);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const onSignOut = useCallback(() => {
    Alert.alert('Sign out?', "You'll stop receiving delivery offers.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  const status = presence?.status ?? 'offline';
  const palette = PRESENCE_COLORS[status];
  const rating =
    profile && profile.ratingCount > 0 ? profile.ratingSum / profile.ratingCount : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {!profile ? (
        isLoading ? null : (
          <EmptyState emoji="🪪" title="No rider profile" body="Ask an admin to finish setting up your account." />
        )
      ) : (
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.meta}>{isViewingAs ? 'Admin preview' : user?.email}</Text>
            </View>
            <Badge label={status} color={palette.color} backgroundColor={palette.bg} />
          </View>

          <View style={styles.divider} />

          <Row label="Phone" value={profile.phone || '—'} />
          <Row label="Vehicle" value={profile.vehicleType} />
          <Row label="Plate" value={profile.plateNumber || '—'} />
          <Row
            label="Rating"
            value={rating ? `⭐ ${rating.toFixed(1)} (${profile.ratingCount})` : 'No ratings yet'}
          />
          <Row label="Approved" value={profile.isApproved ? 'Yes' : 'Pending approval'} />
        </View>
      )}

      {isViewingAs ? (
        <Button label="Exit view as" variant="secondary" onPress={stopViewAs} />
      ) : (
        <Button label="Sign out" variant="danger" onPress={onSignOut} />
      )}
    </ScrollView>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  rowValue: { fontSize: 13, color: colors.text, fontWeight: '600', textTransform: 'capitalize' },
});
