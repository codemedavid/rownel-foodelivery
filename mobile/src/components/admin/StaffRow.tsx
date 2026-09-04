import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { StaffRecord } from '../../lib/adminTypes';
import { colors, radius, spacing } from '../../theme';
import { Badge } from '../ui/Badge';

interface Props {
  staff: StaffRecord;
  merchantNames: ReadonlyMap<string, string>;
  isBusy: boolean;
  onToggleActive: (staff: StaffRecord, isActive: boolean) => void;
}

export const StaffRow = ({ staff, merchantNames, isBusy, onToggleActive }: Props) => {
  const access = staff.allMerchants
    ? 'All merchants (admin)'
    : staff.merchantIds.map((id) => merchantNames.get(id) ?? 'Unknown').join(', ') || 'No merchants';
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.name}>{staff.name}</Text>
        <Text style={styles.meta}>{staff.email}</Text>
        <Text style={styles.meta} numberOfLines={2}>
          {access}
        </Text>
        {staff.allMerchants && (
          <Badge label="Admin" color={colors.primary} backgroundColor={colors.primaryLight} />
        )}
      </View>
      <Switch
        value={staff.isActive}
        disabled={isBusy}
        onValueChange={(value) => onToggleActive(staff, value)}
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityLabel={`${staff.name} active`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
});
