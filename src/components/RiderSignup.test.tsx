import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import RiderSignup from './RiderSignup';

// ── Mock supabase ─────────────────────────────────────────────────────────────
const mockSignUp = vi.fn();
const mockInsertChain = { eq: vi.fn() };
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: any[]) => mockSignUp(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// ── Mock react-router-dom ────────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderSignup() {
  return render(
    <MemoryRouter>
      <RiderSignup />
    </MemoryRouter>
  );
}

// The Field component and the select label have no htmlFor. Find the
// associated control by walking from the label element to its sibling input/select.
function getFieldByLabel(labelText: RegExp): HTMLElement {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find((l) => labelText.test(l.textContent ?? ''));
  if (!label) throw new Error(`No label matching ${labelText}`);
  const el = label.parentElement?.querySelector('input, select, textarea');
  if (!el) throw new Error(`No control found for label "${label.textContent}"`);
  return el as HTMLElement;
}

function buildInsertChain(result: { data?: any; error: any }) {
  // .from('riders').insert({...}) → resolves to result
  const chain: any = {
    insert: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(getFieldByLabel(/full name/i), 'Test Rider');
  await user.type(getFieldByLabel(/email/i), 'rider@example.com');
  await user.type(getFieldByLabel(/password/i), 'secret123');
  await user.type(getFieldByLabel(/phone number/i), '+639170000001');
  await user.type(getFieldByLabel(/plate number/i), 'ABC-123');
}

describe('RiderSignup', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockFrom.mockReset();
    mockNavigate.mockReset();
  });

  it('renders all form fields and the submit button', () => {
    renderSignup();
    expect(getFieldByLabel(/full name/i)).toBeInTheDocument();
    expect(getFieldByLabel(/email/i)).toBeInTheDocument();
    expect(getFieldByLabel(/password/i)).toBeInTheDocument();
    expect(getFieldByLabel(/phone number/i)).toBeInTheDocument();
    expect(getFieldByLabel(/plate number/i)).toBeInTheDocument();
    expect(getFieldByLabel(/vehicle type/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create rider account/i })).toBeInTheDocument();
  });

  it('renders a link back to the login page', () => {
    renderSignup();
    expect(screen.getByRole('link', { name: /already a rider/i })).toBeInTheDocument();
  });

  it('vehicle type defaults to motorcycle', () => {
    renderSignup();
    const select = getFieldByLabel(/vehicle type/i) as HTMLSelectElement;
    expect(select.value).toBe('motorcycle');
  });

  it('shows success screen after a complete successful signup', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'uid-1' } },
      error: null,
    });
    mockFrom.mockReturnValue(buildInsertChain({ error: null }));

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to login/i })).toBeInTheDocument();
  });

  it('navigates to /rider/login when "Go to Login" is clicked on success screen', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'uid-1' } },
      error: null,
    });
    mockFrom.mockReturnValue(buildInsertChain({ error: null }));

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    await user.click(await screen.findByRole('button', { name: /go to login/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/rider/login');
  });

  it('shows auth error when supabase.auth.signUp fails', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email already taken' },
    });

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    expect(await screen.findByText('Email already taken')).toBeInTheDocument();
  });

  it('shows "Signup failed" when signUp returns no user and no error', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null }, error: null });

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    expect(await screen.findByText(/signup failed/i)).toBeInTheDocument();
  });

  it('shows DB insert error when riders table insert fails', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'uid-2' } },
      error: null,
    });
    mockFrom.mockReturnValue(buildInsertChain({ error: { message: 'DB insert failed' } }));

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    expect(await screen.findByText('DB insert failed')).toBeInTheDocument();
  });

  it('shows "Creating account…" while submitting', async () => {
    mockSignUp.mockReturnValue(new Promise(() => {})); // hangs
    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    expect(await screen.findByRole('button', { name: /creating account/i })).toBeDisabled();
  });

  it('calls supabase.auth.signUp with rider role metadata', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'uid-3' } }, error: null });
    mockFrom.mockReturnValue(buildInsertChain({ error: null }));

    const user = userEvent.setup();
    renderSignup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /create rider account/i }));

    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'rider@example.com',
          password: 'secret123',
          options: expect.objectContaining({
            data: expect.objectContaining({ role: 'rider' }),
          }),
        })
      )
    );
  });
});
