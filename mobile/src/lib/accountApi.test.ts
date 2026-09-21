// Pins the RPC name and the sign-out-after-delete ordering. Both fail silently
// at runtime rather than at compile time: a renamed RPC returns an error object,
// and a skipped sign-out leaves a dead session on the device.

import { supabase } from './supabase';
import { AccountDeletionError, deleteMyAccount } from './accountApi';

jest.mock('./supabase', () => ({
  supabase: { rpc: jest.fn(), auth: { signOut: jest.fn() } },
}));

const mockRpc = supabase.rpc as unknown as jest.Mock;
const mockSignOut = supabase.auth.signOut as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

it('calls the delete_my_account RPC with no arguments', async () => {
  // Arrange / Act
  await deleteMyAccount();

  // Assert — an argument would let a caller aim it at another account.
  expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
});

it('signs out after a successful deletion', async () => {
  // Arrange
  const order: string[] = [];
  mockRpc.mockImplementation(async () => {
    order.push('rpc');
    return { error: null };
  });
  mockSignOut.mockImplementation(async () => {
    order.push('signOut');
    return { error: null };
  });

  // Act
  await deleteMyAccount();

  // Assert
  expect(order).toEqual(['rpc', 'signOut']);
});

it('throws AccountDeletionError and keeps the session when the RPC fails', async () => {
  // Arrange
  mockRpc.mockResolvedValue({ error: { message: 'Rider accounts cannot be deleted in the app.' } });

  // Act / Assert
  await expect(deleteMyAccount()).rejects.toThrow(AccountDeletionError);
  await expect(deleteMyAccount()).rejects.toThrow('Rider accounts cannot be deleted in the app.');
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('falls back to a readable message when the error carries none', async () => {
  // Arrange
  mockRpc.mockResolvedValue({ error: { message: '' } });

  // Act / Assert
  await expect(deleteMyAccount()).rejects.toThrow(
    'Your account could not be deleted. Please try again.'
  );
});
