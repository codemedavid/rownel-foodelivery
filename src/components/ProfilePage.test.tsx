import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ProfilePage from './ProfilePage';

// ── Mock AuthContext ──────────────────────────────────────────────────────────
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();

const authState = {
  user: null as null | { id: string; email: string; user_metadata?: Record<string, unknown> },
  loading: false,
  isAdmin: false,
  isStaff: false,
  isRider: false,
  isCustomer: false,
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    ...authState,
    session: null,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
    changePassword: vi.fn(),
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  authState.isAdmin = false;
  authState.isStaff = false;
  authState.isCustomer = false;
});

describe('ProfilePage (guest)', () => {
  it('offers optional sign in and account creation without blocking browsing', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it('submits sign in credentials', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'buyer@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('buyer@example.com', 'secret123')
    );
  });

  it('switches to registration and submits name, email and password', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await userEvent.type(screen.getByLabelText(/name/i), 'Juan Dela Cruz');
    await userEvent.type(screen.getByLabelText(/email/i), 'juan@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith('juan@example.com', 'secret123', 'Juan Dela Cruz')
    );
  });

  it('shows the sign-in error when credentials are rejected', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'buyer@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument();
  });
});

describe('ProfilePage (signed in)', () => {
  it('shows the account email and a sign out action for customers', async () => {
    authState.user = { id: 'u1', email: 'buyer@example.com' };
    authState.isCustomer = true;
    renderPage();
    expect(screen.getAllByText('buyer@example.com').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('shows an admin dashboard shortcut for admins only', () => {
    authState.user = { id: 'u2', email: 'admin@clickeats.com' };
    authState.isAdmin = true;
    renderPage();
    expect(screen.getByRole('link', { name: /admin dashboard/i })).toHaveAttribute('href', '/admin');
  });

  it('does not show the admin shortcut for customers', () => {
    authState.user = { id: 'u1', email: 'buyer@example.com' };
    authState.isCustomer = true;
    renderPage();
    expect(screen.queryByRole('link', { name: /admin dashboard/i })).not.toBeInTheDocument();
  });
});
