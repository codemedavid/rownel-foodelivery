import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';

const PULSE_DURATION_MS = 750;
const DIM_OPACITY = 0.45;

interface Props {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** A single shimmering placeholder block. */
export const Skeleton = ({ width = '100%', height = 14, borderRadius = radius.sm, style }: Props) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: DIM_OPACITY,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.skeleton, opacity }, style]}
    />
  );
};

/** Placeholder shaped like a MerchantCard, shown while restaurants load. */
export const MerchantCardSkeleton = () => (
  <View style={styles.card}>
    <Skeleton height={156} borderRadius={0} />
    <View style={styles.body}>
      <Skeleton width="65%" height={17} />
      <Skeleton width="40%" height={13} />
      <Skeleton width="80%" height={13} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  body: { padding: spacing.lg, gap: spacing.sm },
});
