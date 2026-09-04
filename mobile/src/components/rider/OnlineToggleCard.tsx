import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { timeAgo } from '../../lib/formatters';

interface Props {
  isOnline: boolean;
  isBusy: boolean;
  canGoOnline: boolean;
  permission: 'granted' | 'denied' | 'unknown';
  lastFixAt: number | null;
  isLocationFresh: boolean;
  error?: string | null;
  onToggle: (next: boolean) => void;
}

const gpsLabel = (
  permission: Props['permission'],
  lastFixAt: number | null,
  isFresh: boolean
): { text: string; color: string } => {
  if (permission === 'denied') {
    return { text: 'Location off — enable it in Settings to receive offers', color: colors.danger };
  }
  if (!lastFixAt) return { text: 'Waiting for GPS…', color: colors.textSecondary };
  if (!isFresh) return { text: `Last fix ${timeAgo(lastFixAt)} — keep the app open`, color: '#b45309' };
  return { text: `GPS live · updated ${timeAgo(lastFixAt)}`, color: colors.success };
};

/** Presence control. Going online is blocked until there is a real GPS fix. */
export const OnlineToggleCard = ({
  isOnline,
  isBusy,
  canGoOnline,
  permission,
  lastFixAt,
  isLocationFresh,
  error,
  onToggle,
}: Props) => {
  const gps = gpsLabel(permission, lastFixAt, isLocationFresh);
  const isDisabled = isBusy || (!isOnline && !canGoOnline);

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
      {!isOnline && !canGoOnline && permission !== 'denied' && (
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
  hint: { fontSize: 12, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger },
});
