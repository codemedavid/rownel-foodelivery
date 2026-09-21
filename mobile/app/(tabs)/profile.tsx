import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useUserLocation } from '../../src/context/LocationContext';
import { useCustomerOrders } from '../../src/hooks/useCustomerOrders';
import { summarizeOrders } from '../../src/lib/customerOrders';
import { deleteMyAccount } from '../../src/lib/accountApi';
import { Avatar, Button } from '../../src/components/ui';
import { colors, formatPeso, radius, shadows, spacing } from '../../src/theme';

type AuthMode = 'signin' | 'register';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/* ------------------------------------------------------------------ shared */

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress?: () => void;
  tint?: string;
  right?: React.ReactNode;
  isLast?: boolean;
}

function MenuItem({ icon, label, hint, onPress, tint, right, isLast }: MenuItemProps) {
  const color = tint ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.menuItem,
        !isLast && styles.menuItemDivider,
        pressed && styles.menuItemPressed,
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: `${color}1a` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuLabel, tint ? { color: tint } : null]}>{label}</Text>
        {!!hint && <Text style={styles.menuHint}>{hint}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

/* ------------------------------------------------------------------- guest */

function GuestProfile() {
  const { signIn, signUp } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegistering = mode === 'register';

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setFormError('');
    setNotice('');
  };

  const handleSubmit = async () => {
    setFormError('');
    setNotice('');
    if (!email.trim() || !password) {
      setFormError('Email and password are required.');
      return;
    }
    if (isRegistering && name.trim().length < 2) {
      setFormError('Please enter your name.');
      return;
    }

    setIsSubmitting(true);
    const { error } = isRegistering
      ? await signUp(email.trim(), password, name.trim())
      : await signIn(email.trim(), password);
    setIsSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    if (isRegistering) {
      setNotice('Account created! Check your email if confirmation is required.');
    }
  };

  return (
    <View>
      <View style={[styles.guestHero, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.guestBadge}>
          <Ionicons name="fast-food" size={26} color={colors.onPrimary} />
        </View>
        <Text style={styles.guestTitle}>
          {isRegistering ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text style={styles.guestSubtitle}>
          Ordering as a guest always works — an account just keeps your history and addresses on
          every device.
        </Text>
      </View>

      <View style={styles.guestBody}>
        <View style={styles.modeSwitch}>
          {(['signin', 'register'] as const).map((option) => {
            const isActive = mode === option;
            return (
              <Pressable
                key={option}
                onPress={() => switchMode(option)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.modeOption, isActive && styles.modeOptionActive]}
              >
                <Text style={[styles.modeLabel, isActive && styles.modeLabelActive]}>
                  {option === 'signin' ? 'Sign in' : 'Register'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.formCard}>
          {isRegistering && (
            <InputRow
              icon="person-outline"
              placeholder="Your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}
          <InputRow
            icon="mail-outline"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <InputRow
            icon="lock-closed-outline"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!isPasswordVisible}
            right={
              <Pressable
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            }
          />

          {!!formError && (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.bannerError}>{formError}</Text>
            </View>
          )}
          {!!notice && (
            <View style={[styles.banner, styles.bannerSuccessWrap]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.bannerSuccess}>{notice}</Text>
            </View>
          )}

          <Button
            label={isRegistering ? 'Create account' : 'Sign in'}
            onPress={handleSubmit}
            isLoading={isSubmitting}
            size="lg"
            style={styles.submit}
          />
        </View>

        <View style={styles.perks}>
          <Perk icon="time-outline" text="Reorder your favourites in two taps" />
          <Perk icon="notifications-outline" text="Live updates from kitchen to doorstep" />
          <Perk icon="phone-portrait-outline" text="Your history on every device you use" />
        </View>
      </View>
    </View>
  );
}

function InputRow({
  icon,
  right,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & {
  icon: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.inputRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        {...inputProps}
      />
      {right}
    </View>
  );
}

function Perk({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.perk}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.perkText}>{text}</Text>
    </View>
  );
}

/* --------------------------------------------------------------- signed in */

function SignedInProfile() {
  const { user, signOut, isPushAvailable } = useAuth();
  const { locationLabel, requestLocation } = useUserLocation();
  const { orders } = useCustomerOrders();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.email || '';
  const summary = useMemo(() => summarizeOrders(orders), [orders]);
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' })
    : null;

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can keep ordering as a guest anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const [isDeleting, setIsDeleting] = useState(false);

  const runDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMyAccount();
      // deleteMyAccount signs out, so AuthProvider swaps this screen for the
      // signed-out one; there is no state left here to reset.
      Alert.alert('Account deleted', 'Your account and personal details have been removed.');
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Your account could not be deleted. Please try again.';
      Alert.alert('Could not delete account', message);
      setIsDeleting(false);
    }
  };

  // Two steps on purpose: this is irreversible, and the second prompt spells
  // out what is actually destroyed.
  const confirmDeleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and removes your name, phone number and saved addresses. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('This cannot be undone', 'Delete your Row-Nel account permanently?', [
              { text: 'Keep my account', style: 'cancel' },
              { text: 'Delete account', style: 'destructive', onPress: () => void runDelete() },
            ]),
        },
      ]
    );

  return (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.heroRow}>
          <Avatar name={displayName} size={62} />
          <View style={styles.heroText}>
            <Text style={styles.heroName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.heroEmail} numberOfLines={1}>
              {user?.email}
            </Text>
            {!!memberSince && (
              <View style={styles.memberChip}>
                <Ionicons name="sparkles" size={11} color={colors.accentDark} />
                <Text style={styles.memberChipText}>Member since {memberSince}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatTile label="Orders" value={String(summary.orderCount)} icon="receipt-outline" />
        <StatTile label="Active" value={String(summary.activeCount)} icon="bicycle-outline" />
        <StatTile label="Spent" value={formatPeso(summary.totalSpent)} icon="wallet-outline" />
      </View>

      <View style={styles.content}>
        <MenuGroup title="Activity">
          <MenuItem
            icon="receipt-outline"
            label="My orders"
            hint={
              summary.activeCount > 0
                ? `${summary.activeCount} in progress`
                : 'View your order history'
            }
            onPress={() => router.push('/orders')}
          />
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            hint={isPushAvailable ? 'Push alerts are on' : 'Push alerts are off on this device'}
            onPress={() => router.push('/notifications')}
            isLast
          />
        </MenuGroup>

        <MenuGroup title="Delivery">
          <MenuItem
            icon="location-outline"
            label="Delivery location"
            hint={locationLabel}
            onPress={() => requestLocation()}
            right={<Ionicons name="refresh" size={17} color={colors.textMuted} />}
          />
          <MenuItem
            icon="basket-outline"
            label="Current basket"
            hint="Review what you've added"
            onPress={() => router.push('/cart')}
            isLast
          />
        </MenuGroup>

        <MenuGroup title="Account">
          <MenuItem
            icon="mail-outline"
            label="Email"
            hint={user?.email ?? ''}
            right={
              user?.email_confirmed_at ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              ) : undefined
            }
          />
          <MenuItem
            icon="log-out-outline"
            label="Sign out"
            tint={colors.danger}
            onPress={confirmSignOut}
            right={<View />}
          />
          <MenuItem
            icon="trash-outline"
            label="Delete account"
            hint="Permanently removes your account and personal details"
            tint={colors.danger}
            onPress={isDeleting ? undefined : confirmDeleteAccount}
            right={isDeleting ? <ActivityIndicator size="small" color={colors.danger} /> : <View />}
            isLast
          />
        </MenuGroup>

        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </View>
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ screen */

export default function ProfileScreen() {
  const { user, isLoading } = useAuth();

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : user ? (
          <SignedInProfile />
        ) : (
          <GuestProfile />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xxl },

  /* signed-in hero */
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroText: { flex: 1 },
  heroName: { fontSize: 21, fontWeight: '800', color: colors.onPrimary, letterSpacing: -0.4 },
  heroEmail: { fontSize: 13.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: spacing.sm,
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  memberChipText: { fontSize: 11, fontWeight: '800', color: colors.accentDark },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.xxl,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadows.md,
  },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11.5, color: colors.textSecondary, fontWeight: '700' },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  group: { marginBottom: spacing.xl },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItemPressed: { backgroundColor: colors.surfaceSunken },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  menuHint: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },

  /* guest */
  guestHero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    alignItems: 'center',
  },
  guestBadge: {
    width: 62,
    height: 62,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.onPrimary,
    marginTop: spacing.md,
    letterSpacing: -0.4,
  },
  guestSubtitle: {
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  guestBody: { paddingHorizontal: spacing.lg, marginTop: -spacing.xl },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.full,
  },
  modeOptionActive: { backgroundColor: colors.surface, ...shadows.sm },
  modeLabel: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
  modeLabelActive: { color: colors.text },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.text },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerSuccessWrap: { backgroundColor: colors.successLight },
  bannerError: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },
  bannerSuccess: { flex: 1, color: colors.success, fontSize: 13, fontWeight: '600' },
  submit: { marginTop: spacing.xs },
  perks: { marginTop: spacing.xl, gap: spacing.md, paddingHorizontal: spacing.xs },
  perk: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  perkText: { flex: 1, fontSize: 13.5, color: colors.textSecondary, fontWeight: '600' },
});
