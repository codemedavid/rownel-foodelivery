import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useLiveQuery } from '../src/hooks/useLiveQuery';
import { notificationsApi } from '../src/lib/notificationsApi';
import type { AppNotification } from '../src/lib/adminTypes';
import { parseNotificationRoute } from '../src/lib/pushRouting';
import { timeAgo } from '../src/lib/formatters';
import { colors, radius, spacing } from '../src/theme';
import { Button, EmptyState } from '../src/components/ui';

const KIND_EMOJI: Record<AppNotification['kind'], string> = {
  new_order: '🧾',
  status_change: '🔔',
  rider_assigned: '🛵',
  new_offer: '📬',
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
      {error && <Text style={styles.error}>{error.message}</Text>}
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, !item.readAt && styles.unread, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.emoji}>{KIND_EMOJI[item.kind] ?? '🔔'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </View>
            {!item.readAt && <View style={styles.dot} />}
          </Pressable>
        )}
        ListEmptyComponent={
          isLoading ? null : <EmptyState emoji="🔕" title="No notifications yet" body="Order updates will show up here." />
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
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  unread: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  emoji: { fontSize: 22 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  body: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  error: { color: colors.danger, margin: spacing.lg, fontSize: 13 },
});
