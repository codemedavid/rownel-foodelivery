import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useRiderOfferAlerts } from '../../src/hooks/useRiderOfferAlerts';
import { useUnreadNotificationCount } from '../../src/hooks/useUnreadNotificationCount';
import { colors } from '../../src/theme';

const MAX_BADGE = 99;

function BellButton({ count }: { count: number }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={`Notifications, ${count} unread`}
      style={styles.bell}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > MAX_BADGE ? `${MAX_BADGE}+` : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function RiderLayout() {
  const { user, isPushAvailable } = useAuth();
  const { unreadCount, refetch } = useUnreadNotificationCount(user?.id);
  const onNotification = useCallback(() => {
    refetch();
  }, [refetch]);
  useRiderOfferAlerts(user?.id, { isPushAvailable, onNotification });

  const headerRight = () => <BellButton count={unreadCount} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
        headerRight,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: 'Deliveries',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="delivery/[id]" options={{ href: null, title: 'Delivery' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bell: { paddingHorizontal: 14, paddingVertical: 6 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
