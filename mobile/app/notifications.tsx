import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { notificationsApi } from '../src/lib/notificationsApi';
import type { AppNotification } from '../src/lib/adminTypes';
import { parseNotificationRoute } from '../src/lib/pushRouting';
import { timeAgo } from '../src/lib/formatters';
import { colors, radius, shadows, spacing } from '../src/theme';
import { Button, EmptyState } from '../src/components/ui';

type KindStyle = { icon: keyof typeof Ionicons.glyphMap; color: string; background: string };

const KIND_STYLES: Record<AppNotification['kind'], KindStyle> = {
  new_order: { icon: 'receipt-outline', color: colors.info, background: colors.infoLight },
  status_change: {
    icon: 'notifications-outline',
    color: colors.accentDark,
    background: colors.accentLight,
  },
  rider_assigned: { icon: 'bicycle-outline', color: colors.primary, background: colors.primaryLight },
  new_offer: { icon: 'mail-unread-outline', color: colors.success, background: colors.successLight },
};

const FALLBACK_KIND: KindStyle = {
  icon: 'notifications-outline',
  color: colors.textSecondary,
  background: colors.surfaceSunken,
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const fetcher = useCallback(() => notificationsApi.list(), []);
  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [user?.id], {
    enabled: !!user,
    realtime: user ? [{ table: 'notifications', filter: `recipient_user_id=eq.${user.id}` }] : [],
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const notifications = data ?? [];
  const unread = notifications.filter((n) => !n.readAt);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      await refetch();
    } catch {
      // Read state is cosmetic; the next refresh reflects the server.
    }
  }, [refetch]);

  const open = useCallback(
    async (notification: AppNotification) => {
      if (!notification.readAt) {
        notificationsApi.markRead([notification.id]).catch(() => undefined);
      }
      router.push(parseNotificationRoute(notification.data) as never);
    },
    [router]
  );

  useEffect(() => {
    if (!user) router.replace('/(tabs)/profile');
  }, [user, router]);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () =>
            unread.length > 0 ? <Button label="Mark all read" variant="ghost" size="sm" onPress={markAllRead} /> : null,
        }}
      />
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.error}>{error.message}</Text>
        </View>
      )}
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const kind = KIND_STYLES[item.kind] ?? FALLBACK_KIND;
          return (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, !item.readAt && styles.unread, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.iconTile, { backgroundColor: kind.background }]}>
                <Ionicons name={kind.icon} size={19} color={kind.color} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.readAt && <View style={styles.dot} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon="notifications-off-outline"
              title="No notifications yet"
              body="Order updates will show up here."
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  unread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  titleUnread: { fontWeight: '800' },
  body: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 5, fontWeight: '600' },
  dot: { width: 9, height: 9, borderRadius: radius.full, backgroundColor: colors.primary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    margin: spacing.lg,
    marginBottom: 0,
  },
  error: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },
});
