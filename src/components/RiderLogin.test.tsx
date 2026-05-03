import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RiderLogin from './RiderLogin';

// ── Mock AuthContext ──────────────────────────────────────────────────────────
const mockSignIn = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signOut: vi.fn(),
    user: null,
    loading: false,
    session: null,
    isAdmin: false,
    isStaff: false,
    isRider: false,
    changePassword: vi.fn(),
  }),
}));

// ── Mock react-router-dom (keep real MemoryRouter / Link) ────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderLogin() {
  return render(
    <MemoryRouter>
      <RiderLogin />
    </MemoryRouter>
  );
}

// The labels in RiderLogin have no htmlFor, so we query inputs by type/role.
function getEmailInput() {
  return document.querySelector('input[type="email"]') as HTMLInputElement;
}
function getPasswordInput() {
  return document.querySelector('input[type="password"], input[type="text"][value]') as HTMLInputElement;
}
function getPasswordField() {
  // The password input may flip to type=text; always get by placeholder sibling pattern
  // Simpler: just query within the password label's parent
  const labels = Array.from(document.querySelectorAll('label'));
  const pwLabel = labels.find((l) => /password/i.test(l.textContent ?? ''));
  return pwLabel?.parentElement?.querySelector('input') as HTMLInputElement;
}

describe('RiderLogin', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockNavigate.mockReset();
  });

  it('renders the email and password fields and the submit button', () => {
    renderLogin();
    expect(getEmailInput()).toBeInTheDocument();
    expect(getPasswordField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders navigation links to signup and home', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toBeInTheDocument();
  });

  it('shows "Signing in…" while submitting', async () => {
    // Make signIn hang so we can inspect the intermediate state.
    mockSignIn.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), 'rider@example.com');
    await user.type(getPasswordField(), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('navigates to /rider/dashboard on successful login', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), 'rider@example.com');
    await user.type(getPasswordField(), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/rider/dashboard'));
  });

  it('calls signIn with the entered credentials', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), 'rider@example.com');
    await user.type(getPasswordField(), 'mypassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('rider@example.com', 'mypassword')
    );
  });

  it('displays the error message on failed login', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid credentials' } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), 'bad@example.com');
    await user.type(getPasswordField(), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('re-enables the submit button after a failed login', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Bad credentials' } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), 'bad@example.com');
    await user.type(getPasswordField(), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
    );
  });

  it('toggles password visibility when the eye button is clicked', async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = getPasswordField();
    expect(passwordInput).toHaveAttribute('type', 'password');

    // The toggle button has no accessible name – find it by its position in
    // the password field's container (the relative div wrapping the input).
    const toggleBtn = passwordInput.parentElement!.querySelector('button[type="button"]')!;
    await user.click(toggleBtn);

    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
