import React from 'react';
import { Platform, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../src/context/CartContext';
import { useOrderStatusNotifications } from '../../src/hooks/useOrderStatusNotifications';
import { colors, radius, shadows, spacing } from '../../src/theme';

const MAX_BADGE_COUNT = 99;

function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={size - 2} color={color} />
    </View>
  );
}

function CartIcon({
  color,
  size,
  count,
  focused,
}: {
  color: ColorValue;
  size: number;
  count: number;
  focused: boolean;
}) {
  return (
    <View>
      <TabIcon name={focused ? 'basket' : 'basket-outline'} color={color} size={size} focused={focused} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { cartItems } = useCart();
  const cartCount = cartItems.reduce((sum, line) => sum + line.quantity, 0);

  // Watches recent orders and fires a notification when the merchant confirms.
  useOrderStatusNotifications();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        headerShadowVisible: false,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTitleAlign: 'left',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          headerTitle: 'Your orders',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'receipt' : 'receipt-outline'}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Basket',
          headerTitle: 'Your basket',
          tabBarIcon: ({ color, size, focused }) => (
            <CartIcon color={color} size={size} count={cartCount} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingTop: spacing.sm,
    ...shadows.sm,
  },
  tabItem: { paddingVertical: 2 },
  tabLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  iconWrap: {
    width: 46,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.primaryLight },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontWeight: '800', fontSize: 20, color: colors.text, letterSpacing: -0.4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: 2,
    minWidth: 17,
    height: 17,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
});
