// Deleting the signed-in customer's account.
//
// The work happens in the delete_my_account() RPC, which scrubs the personal
// details from the customer's past orders and then removes the auth row. It
// reads auth.uid() itself and takes no argument, so a caller cannot aim it at
// anyone else's account.

import { supabase } from './supabase';

export class AccountDeletionError extends Error {
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
 * token is dead, and leaving it on the device puts the app in a signed-in
 * state it can never recover from.
 */
export const deleteMyAccount = async (): Promise<void> => {
  const { error } = await supabase.rpc('delete_my_account');

  if (error) {
    throw new AccountDeletionError(
      error.message || 'Your account could not be deleted. Please try again.',
      { cause: error }
    );
  }

  await supabase.auth.signOut();
};
