import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { adminRidersApi } from '../../../src/lib/adminRidersApi';
import type { VehicleType } from '../../../src/lib/adminTypes';
import { colors, spacing } from '../../../src/theme';
import { Button, FormField, SegmentedControl, type Segment } from '../../../src/components/ui';

const MIN_PASSWORD_LENGTH = 8;
const VEHICLES: Segment<VehicleType>[] = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
];

export default function NewRiderScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('motorcycle');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setFormError('');
    if (name.trim().length < 2) return setFormError('Enter the rider’s name.');
    if (!email.trim().includes('@')) return setFormError('Enter a valid email.');
    if (password.length < MIN_PASSWORD_LENGTH) return setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (phone.trim().length < 7) return setFormError('Enter a contact number.');
    if (!plateNumber.trim()) return setFormError('Enter the plate number.');

    setIsSubmitting(true);
    try {
      await adminRidersApi.create({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        plateNumber: plateNumber.trim().toUpperCase(),
        vehicleType,
      });
      Alert.alert('Rider created', `${name.trim()} is approved and can sign in to the rider app.`);
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create rider.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <FormField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
      <FormField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <FormField label="Temporary password" value={password} onChangeText={setPassword} secureTextEntry />
      <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <FormField label="Plate number" value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" />
      <Text style={styles.label}>Vehicle</Text>
      <SegmentedControl segments={VEHICLES} value={vehicleType} onChange={setVehicleType} />
      {!!formError && <Text style={styles.error}>{formError}</Text>}
      <Button label="Create rider account" onPress={submit} isLoading={isSubmitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  error: { color: colors.danger, fontSize: 13 },
});
