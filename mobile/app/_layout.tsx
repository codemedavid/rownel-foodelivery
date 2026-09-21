import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';
import { LocationProvider } from '../src/context/LocationContext';
import { RoleGate } from '../src/components/RoleGate';
import { ViewAsBanner } from '../src/components/ViewAsBanner';
import { parseNotificationRoute } from '../src/lib/pushRouting';
import '../src/lib/notifications';
import { colors } from '../src/theme';

/** Opens the right screen when a push or local notification is tapped. */
const useNotificationTapRouting = () => {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      if (!data) return;
      router.push(parseNotificationRoute(data) as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
};

/**
 * The "view as" banner owns the status bar area while a preview is running, so
 * the navigator below it must not claim the top inset a second time.
 */
function BannerHost({ children }: { children: React.ReactNode }) {
  const { isViewingAs } = useAuth();
  const insets = useSafeAreaInsets();
  if (!isViewingAs) return <>{children}</>;
  return (
    <View style={{ flex: 1 }}>
      <ViewAsBanner />
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function RootNavigator() {
  useNotificationTapRouting();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '800', fontSize: 18, color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(rider)" options={{ headerShown: false }} />
      <Stack.Screen name="merchant/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="item/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
      <Stack.Screen
        name="order/[id]"
        options={{ title: 'Track your order', headerBackVisible: false }}
      />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="addresses" options={{ title: 'Delivery addresses' }} />
      <Stack.Screen name="address/[id]" options={{ title: 'Address' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocationProvider>
          <CartProvider>
            <StatusBar style="dark" />
            <RoleGate>
              <BannerHost>
                <RootNavigator />
              </BannerHost>
            </RoleGate>
          </CartProvider>
        </LocationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
