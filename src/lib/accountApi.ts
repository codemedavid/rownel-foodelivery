// Deleting the signed-in customer's account.
//
// Shares the delete_my_account() RPC with the mobile app (see
// mobile/src/lib/accountApi.ts). The RPC reads auth.uid() itself and takes no
// argument, so a caller cannot aim it at anyone else's account.

import { supabase } from './supabase';

export class AccountDeletionError extends Error {
  // Declared rather than inherited: this app's TS lib target predates
  // ES2022's Error.cause.
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'AccountDeletionError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * Deletes the signed-in customer's account, then clears the local session.
 *
 * The sign-out is deliberate: once the auth row is gone the stored refresh
 * token is dead, and leaving it in storage puts the app in a signed-in state
 * it can never recover from.
 */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');

  if (error) {
    throw new AccountDeletionError(
      error.message || 'Your account could not be deleted. Please try again.',
      { cause: error }
    );
  }

  await supabase.auth.signOut();
}
