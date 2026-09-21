import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { timeAgo } from '../../lib/formatters';
import { canRetryGps, riderGpsStatus, type RiderGpsStatus } from '../../lib/riderGps';
import type { LocationPermission } from '../../lib/riderTypes';
import { useNow } from '../../hooks/useNow';

/** The GPS line re-reads the clock this often so "x ago" stays honest. */
const CLOCK_TICK_MS = 5_000;

interface Props {
  isOnline: boolean;
  isBusy: boolean;
  canGoOnline: boolean;
  permission: LocationPermission;
  /** True once this device has a real fix in hand. */
  hasFix: boolean;
  lastFixAt: number | null;
  searchStartedAt: number | null;
  locationError?: string | null;
  error?: string | null;
  /** Admin preview: show the rider's state but never change it. */
  isReadOnly?: boolean;
  onToggle: (next: boolean) => void;
  onRetryGps: () => void;
}

const gpsLabel = (
  status: RiderGpsStatus,
  lastFixAt: number | null
): { text: string; color: string } => {
  switch (status) {
    case 'denied':
      return { text: 'Location off — enable it in Settings to receive offers', color: colors.danger };
    case 'error':
      return { text: 'No GPS fix yet — tap retry', color: colors.danger };
    case 'slow':
      return { text: 'Still looking for GPS — try moving under open sky', color: '#b45309' };
    case 'stale':
      return lastFixAt === null
        ? { text: 'Waiting for GPS…', color: colors.textSecondary }
        : { text: `Last fix ${timeAgo(lastFixAt)} — keep the app open`, color: '#b45309' };
    case 'live':
      return lastFixAt === null
        ? { text: 'GPS live', color: colors.success }
        : { text: `GPS live · updated ${timeAgo(lastFixAt)}`, color: colors.success };
    case 'searching':
    default:
      return { text: 'Waiting for GPS…', color: colors.textSecondary };
  }
};

/** Presence control. Going online is blocked until there is a real GPS fix. */
export const OnlineToggleCard = ({
  isOnline,
  isBusy,
  canGoOnline,
  permission,
  hasFix,
  lastFixAt,
  searchStartedAt,
  locationError,
  error,
  isReadOnly = false,
  onToggle,
  onRetryGps,
}: Props) => {
  const now = useNow(CLOCK_TICK_MS);
  const status = riderGpsStatus({
    permission,
    hasFix,
    lastFixAt,
    error: locationError ?? null,
    searchStartedAt,
    now,
  });
  const gps = gpsLabel(status, lastFixAt);
  const isDisabled = isReadOnly || isBusy || (!isOnline && !canGoOnline);
  const showRetry = !isReadOnly && canRetryGps(status);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>{isOnline ? "You're online" : "You're offline"}</Text>
          <Text style={[styles.gps, { color: gps.color }]}>{gps.text}</Text>
        </View>
        {isBusy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Switch
            value={isOnline}
            disabled={isDisabled}
            onValueChange={onToggle}
            trackColor={{ true: colors.success, false: colors.border }}
            accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
          />
        )}
      </View>
      {showRetry && (
        <Pressable
          onPress={onRetryGps}
          accessibilityRole="button"
          accessibilityLabel="Retry GPS"
          style={styles.retry}
        >
          <Text style={styles.retryText}>Retry GPS</Text>
        </Pressable>
      )}
      {isReadOnly && <Text style={styles.hint}>Read-only preview — presence cannot be changed.</Text>}
      {status === 'error' && !!locationError && <Text style={styles.hint}>{locationError}</Text>}
      {!isReadOnly && !isOnline && !canGoOnline && permission !== 'denied' && status !== 'error' && (
        <Text style={styles.hint}>Waiting for a GPS fix before you can go online.</Text>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  gps: { fontSize: 12, fontWeight: '600' },
  retry: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  hint: { fontSize: 12, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
