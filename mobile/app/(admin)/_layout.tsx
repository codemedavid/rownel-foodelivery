import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useStaffOrderAlerts } from '../../src/hooks/useStaffOrderAlerts';
import { useUnreadNotificationCount } from '../../src/hooks/useUnreadNotificationCount';
import { canAccessAdminTab, type AdminTab } from '../../src/lib/roles';
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

export default function AdminLayout() {
  const { user, roleContext, isPushAvailable } = useAuth();
  const { unreadCount, refetch } = useUnreadNotificationCount(user?.id);
  const onNotification = useCallback(() => {
    refetch();
  }, [refetch]);
  useStaffOrderAlerts(user?.id, { isPushAvailable, onNotification });

  const tabHref = (tab: AdminTab) => (canAccessAdminTab(roleContext, tab) ? undefined : null);
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
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Sales',
          href: tabHref('analytics'),
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: 'Staff',
          href: tabHref('staff'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="riders"
        options={{
          title: 'Riders',
          href: tabHref('riders'),
          tabBarIcon: ({ color, size }) => <Ionicons name="bicycle-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="order/[id]" options={{ href: null, title: 'Order' }} />
      <Tabs.Screen name="staff/new" options={{ href: null, title: 'New staff' }} />
      <Tabs.Screen name="riders/new" options={{ href: null, title: 'New rider' }} />
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
