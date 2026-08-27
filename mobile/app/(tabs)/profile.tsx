import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '../../src/context/AuthContext';
import { colors, radius, spacing } from '../../src/theme';

type AuthMode = 'signin' | 'register';

function GuestProfile() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError('');
    setNotice('');
    if (!email.trim() || !password) {
      setFormError('Email and password are required.');
      return;
    }
    if (mode === 'register' && name.trim().length < 2) {
      setFormError('Please enter your name.');
      return;
    }

    setIsSubmitting(true);
    const { error } =
      mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim());
    setIsSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    if (mode === 'register') {
      setNotice('Account created! Check your email if confirmation is required.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={30} color="#fff" />
      </View>
      <Text style={styles.title}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
      <Text style={styles.subtitle}>
        An account is optional — you can order as a guest anytime. Signing in keeps your order
        history on every device.
      </Text>

      {mode === 'register' && (
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {!!formError && <Text style={styles.error}>{formError}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      <Pressable
        style={[styles.submit, isSubmitting && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        accessibilityRole="button"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setMode(mode === 'signin' ? 'register' : 'signin');
          setFormError('');
          setNotice('');
        }}
      >
        <Text style={styles.switchText}>
          {mode === 'signin' ? 'New here? Create account' : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  );
}

function SignedInProfile() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.email;

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={30} color="#fff" />
      </View>
      <Text style={styles.title}>{displayName}</Text>
      <Text style={styles.subtitle}>{user?.email}</Text>

      <Pressable
        style={styles.row}
        onPress={() => router.push('/orders')}
        accessibilityRole="button"
      >
        <Ionicons name="receipt-outline" size={20} color={colors.primary} />
        <Text style={styles.rowText}>My Orders</Text>
      </Pressable>

      <Pressable style={styles.row} onPress={() => signOut()} accessibilityRole="button">
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={[styles.rowText, { color: colors.danger }]}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, isLoading } = useAuth();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 19,
  },
  input: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  notice: { color: colors.success, fontSize: 13, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  submit: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  switchText: { color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: spacing.lg },
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
