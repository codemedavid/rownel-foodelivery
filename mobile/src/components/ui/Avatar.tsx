import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

interface Props {
  /** Full name or email — initials are derived from it. */
  name?: string | null;
  size?: number;
  /** Rendered on a coloured brand tile when false (default), plain tint when true. */
  subtle?: boolean;
  style?: ViewStyle;
}

const MAX_INITIALS = 2;

export const getInitials = (name?: string | null): string => {
  const source = (name ?? '').trim();
  if (!source) return '?';
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return words
    .slice(0, MAX_INITIALS)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
};

export const Avatar = ({ name, size = 56, subtle = false, style }: Props) => (
  <View
    style={[
      styles.wrap,
      {
        width: size,
        height: size,
        borderRadius: radius.full,
        backgroundColor: subtle ? colors.primaryLight : colors.primary,
      },
      style,
    ]}
  >
    <Text
      style={[
        styles.text,
        { fontSize: size * 0.38, color: subtle ? colors.primary : colors.onPrimary },
      ]}
    >
      {getInitials(name)}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800', letterSpacing: 0.5 },
});
