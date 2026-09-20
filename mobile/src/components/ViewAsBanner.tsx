import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { viewAsLabel } from '../lib/viewAs';
import { colors, spacing } from '../theme';

/**
 * Always-visible reminder that the admin is previewing someone else's app,
 * plus the way back to their own view.
 */
export const ViewAsBanner = () => {
  const { viewAs, stopViewAs } = useAuth();
  const insets = useSafeAreaInsets();
  const onExit = useCallback(() => stopViewAs(), [stopViewAs]);

  if (!viewAs) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <Ionicons name="eye-outline" size={16} color="#fff" />
      <Text style={styles.label} numberOfLines={1}>
        {viewAsLabel(viewAs)} · read-only
      </Text>
      <Pressable
        onPress={onExit}
        accessibilityRole="button"
        accessibilityLabel="Exit view as and return to your own view"
        style={({ pressed }) => [styles.exit, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.exitLabel}>Exit</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  label: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '700' },
  exit: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  exitLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
