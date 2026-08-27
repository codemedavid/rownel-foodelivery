import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/context/AuthContext';
import { CartProvider } from '../src/context/CartContext';
import { LocationProvider } from '../src/context/LocationContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <LocationProvider>
        <CartProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="merchant/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="item/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="order/[id]" options={{ title: 'Order status', headerBackVisible: false }} />
          </Stack>
        </CartProvider>
        </LocationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
