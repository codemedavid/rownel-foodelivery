// Pins the RPC name and the sign-out-after-delete ordering. Both fail silently
// at runtime rather than at compile time: a renamed RPC returns an error
// object, and a skipped sign-out leaves a dead session in storage.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from './supabase';
import { AccountDeletionError, deleteMyAccount } from './accountApi';

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(), auth: { signOut: vi.fn() } },
}));

const mockRpc = vi.mocked(supabase.rpc);
const mockSignOut = vi.mocked(supabase.auth.signOut);

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ error: null } as never);
  mockSignOut.mockResolvedValue({ error: null } as never);
});

describe('deleteMyAccount', () => {
  it('calls the delete_my_account RPC with no arguments', async () => {
    // Arrange / Act
    await deleteMyAccount();

    // Assert — an argument would let a caller aim it at another account.
    expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
  });

  it('signs out after a successful deletion', async () => {
    // Arrange
    const order: string[] = [];
    mockRpc.mockImplementation((async () => {
      order.push('rpc');
      return { error: null };
    }) as never);
    mockSignOut.mockImplementation((async () => {
      order.push('signOut');
      return { error: null };
    }) as never);

    // Act
    await deleteMyAccount();

    // Assert
    expect(order).toEqual(['rpc', 'signOut']);
  });

  it('throws AccountDeletionError and keeps the session when the RPC fails', async () => {
    // Arrange
    mockRpc.mockResolvedValue({
      error: { message: 'Rider accounts cannot be deleted in the app.' },
    } as never);

    // Act / Assert
    await expect(deleteMyAccount()).rejects.toThrow(AccountDeletionError);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('falls back to a readable message when the error carries none', async () => {
    // Arrange
    mockRpc.mockResolvedValue({ error: { message: '' } } as never);

    // Act / Assert
    await expect(deleteMyAccount()).rejects.toThrow(
      'Your account could not be deleted. Please try again.'
    );
  });
});
