import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useLiveQuery } from '../../src/hooks/useLiveQuery';
import { dispatchSettingsApi } from '../../src/lib/dispatchSettingsApi';
import type { DispatchSettings } from '../../src/lib/adminTypes';
import { colors, radius, spacing } from '../../src/theme';
import { Button, FormField, ListRow } from '../../src/components/ui';

type NumericKey = Exclude<keyof DispatchSettings, 'dispatchOnCreate'>;

const FIELDS: ReadonlyArray<{ key: NumericKey; label: string; hint: string }> = [
  { key: 'offerRadiusKm', label: 'Offer radius (km)', hint: 'Riders within this distance get offers.' },
  { key: 'offerExpiryMs', label: 'Offer expiry (ms)', hint: '5,000 – 600,000' },
  { key: 'maxConcurrentOffers', label: 'Max concurrent offers', hint: '1 – 20 riders per round' },
  { key: 'locationStaleMs', label: 'Location stale after (ms)', hint: '30,000 – 1,800,000' },
  { key: 'maxConcurrentOrdersPerRider', label: 'Max orders per rider', hint: '1 – 10' },
  { key: 'batchTimeWindowMs', label: 'Batch window (ms)', hint: '60,000 – 1,800,000' },
  { key: 'batchProximityKm', label: 'Batch proximity (km)', hint: 'Up to 20' },
];

function DispatchSettingsForm() {
  const fetcher = useCallback(() => dispatchSettingsApi.get(), []);
  const { data, error, refetch } = useLiveQuery(fetcher, [], { realtime: [{ table: 'dispatch_settings' }] });
  const [draft, setDraft] = useState<Record<NumericKey, string> | null>(null);
  const [dispatchOnCreate, setDispatchOnCreate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft(
      FIELDS.reduce(
        (acc, field) => ({ ...acc, [field.key]: String(data[field.key]) }),
        {} as Record<NumericKey, string>
      )
    );
    setDispatchOnCreate(data.dispatchOnCreate);
  }, [data]);

  const save = async () => {
    if (!draft) return;
    const patch: Partial<DispatchSettings> = { dispatchOnCreate };
    for (const field of FIELDS) {
      const value = Number(draft[field.key]);
      if (!Number.isFinite(value) || value <= 0) {
        Alert.alert('Invalid value', `${field.label} must be a positive number.`);
        return;
      }
      patch[field.key] = value;
    }
    setIsSaving(true);
    try {
      await dispatchSettingsApi.update(patch);
      await refetch();
      Alert.alert('Saved', 'Dispatch settings updated.');
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (error) return <Text style={styles.error}>{error.message}</Text>;
  if (!draft) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Dispatch settings</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Dispatch on order creation</Text>
        <Switch value={dispatchOnCreate} onValueChange={setDispatchOnCreate} trackColor={{ true: colors.primary, false: colors.border }} />
      </View>
      {FIELDS.map((field) => (
        <FormField
          key={field.key}
          label={field.label}
          hint={field.hint}
          value={draft[field.key]}
          keyboardType="decimal-pad"
          onChangeText={(text) => setDraft((current) => (current ? { ...current, [field.key]: text } : current))}
        />
      ))}
      <Button label="Save settings" onPress={save} isLoading={isSaving} />
    </View>
  );
}

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { user, roleContext, staffRecord, isPushAvailable, signOut, viewAs, isViewingAs, stopViewAs } =
    useAuth();
  const displayName =
    viewAs?.name ||
    staffRecord?.name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.meta}>{isViewingAs ? 'Admin preview · read-only' : user?.email}</Text>
        <Text style={styles.meta}>
          Role: {roleContext.role} · Push: {isPushAvailable ? 'on this device' : 'in-app only'}
        </Text>
      </View>

      <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
      <ListRow icon="storefront-outline" title="Browse as customer" onPress={() => router.push('/(tabs)')} />

      {roleContext.isAdmin && !isViewingAs && <DispatchSettingsForm />}

      {isViewingAs ? (
        <ListRow icon="eye-off-outline" title="Exit view as" onPress={stopViewAs} />
      ) : (
        <ListRow
          icon="log-out-outline"
          title="Sign out"
          destructive
          onPress={() =>
            Alert.alert('Sign out?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  error: { color: colors.danger, fontSize: 13 },
});
