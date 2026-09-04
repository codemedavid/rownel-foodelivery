import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, View } from 'react-native';
import type { RiderSummary } from '../../lib/adminTypes';
import { useRidersForAssignment } from '../../hooks/useRidersForAssignment';
import { colors, radius, spacing } from '../../theme';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { RiderRow } from './RiderRow';

interface Props {
  isVisible: boolean;
  currentRiderId?: string;
  onClose: () => void;
  onAssign: (rider: RiderSummary) => Promise<void>;
}

export const AssignRiderSheet = ({ isVisible, currentRiderId, onClose, onAssign }: Props) => {
  const { riders, isLoading, error } = useRidersForAssignment(isVisible);
  const [selected, setSelected] = useState<RiderSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!selected) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onAssign(selected);
      setSelected(null);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not assign rider');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Assign a rider</Text>
          <Text style={styles.subtitle}>
            Riders at capacity are greyed out. Assigning cancels any pending auto-dispatch offers.
          </Text>
          {isLoading && riders.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
          ) : error ? (
            <Text style={styles.error}>{error.message}</Text>
          ) : (
            <FlatList
              data={riders}
              keyExtractor={(rider) => rider.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <RiderRow
                  rider={item}
                  isSelected={selected?.id === item.id || (!selected && currentRiderId === item.id)}
                  onPress={setSelected}
                />
              )}
              ListEmptyComponent={
                <EmptyState emoji="🛵" title="No riders available" body="Approve and activate riders first." />
              }
            />
          )}
          {!!submitError && <Text style={styles.error}>{submitError}</Text>}
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.action} />
            <Button
              label="Assign"
              onPress={handleAssign}
              isLoading={isSubmitting}
              disabled={!selected || selected.id === currentRiderId}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '85%',
    gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  list: { gap: spacing.sm, paddingVertical: spacing.sm },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
});
