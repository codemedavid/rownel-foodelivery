import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMerchants } from '../../../src/hooks/useMerchants';
import { adminStaffApi } from '../../../src/lib/adminStaffApi';
import { colors, radius, spacing } from '../../../src/theme';
import { Button, FormField } from '../../../src/components/ui';

const MIN_PASSWORD_LENGTH = 8;

export default function NewStaffScreen() {
  const router = useRouter();
  const { merchants } = useMerchants();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [allMerchants, setAllMerchants] = useState(false);
  const [merchantIds, setMerchantIds] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleMerchant = (id: string) =>
    setMerchantIds((current) => (current.includes(id) ? current.filter((m) => m !== id) : [...current, id]));

  const submit = async () => {
    setFormError('');
    if (name.trim().length < 2) return setFormError('Enter the staff member’s name.');
    if (!email.trim().includes('@')) return setFormError('Enter a valid email.');
    if (password.length < MIN_PASSWORD_LENGTH) return setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (!allMerchants && merchantIds.length === 0) return setFormError('Pick at least one merchant or grant all merchants.');

    setIsSubmitting(true);
    try {
      await adminStaffApi.create({ name: name.trim(), email: email.trim(), password, merchantIds, allMerchants });
      Alert.alert('Staff created', `${name.trim()} can now sign in.`);
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create staff.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <FormField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
      <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <FormField label="Temporary password" value={password} onChangeText={setPassword} secureTextEntry />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>All merchants (admin)</Text>
          <Text style={styles.switchHint}>Grants full access, including sales, staff and riders.</Text>
        </View>
        <Switch value={allMerchants} onValueChange={setAllMerchants} trackColor={{ true: colors.primary, false: colors.border }} />
      </View>

      {!allMerchants && (
        <View style={styles.merchants}>
          <Text style={styles.sectionLabel}>Merchant access</Text>
          {merchants.map((merchant) => {
            const isSelected = merchantIds.includes(merchant.id);
            return (
              <Pressable
                key={merchant.id}
                onPress={() => toggleMerchant(merchant.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                style={[styles.merchantChip, isSelected && styles.merchantChipSelected]}
              >
                <Text style={[styles.merchantText, isSelected && { color: '#fff' }]}>{merchant.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!!formError && <Text style={styles.error}>{formError}</Text>}
      <Button label="Create staff account" onPress={submit} isLoading={isSubmitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  switchLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12, color: colors.textSecondary },
  merchants: { gap: spacing.sm },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  merchantChip: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  merchantChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  merchantText: { fontSize: 14, fontWeight: '600', color: colors.text },
  error: { color: colors.danger, fontSize: 13 },
});
