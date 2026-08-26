import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '../src/context/CartContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="merchant/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="item/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
          <Stack.Screen name="cart" options={{ title: 'Your basket' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order placed', headerBackVisible: false }} />
        </Stack>
      </CartProvider>
    </SafeAreaProvider>
  );
}
