import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ProtectedRiderRoute from './ProtectedRiderRoute';
import { makeAuthUser, makeRiderProfile } from '../test/mocks';

// ── Module-level mocks with controllable return values ────────────────────────
const mockUseAuth = vi.fn();
const mockUseRiderProfile = vi.fn();
const mockUseConvexAuth = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/useRiderProfile', () => ({
  useRiderProfile: () => mockUseRiderProfile(),
  ratingAverage: () => null,
}));

vi.mock('convex/react', () => ({
  useConvexAuth: () => mockUseConvexAuth(),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────
function renderRoute(children: React.ReactNode = <div>Protected Content</div>) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={<ProtectedRiderRoute>{children}</ProtectedRiderRoute>}
        />
        <Route path="/rider/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRiderRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseRiderProfile.mockReset();
    mockUseConvexAuth.mockReset();
    mockUseConvexAuth.mockReturnValue({ isLoading: false });
  });

  it('shows a loading indicator while auth is resolving', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockUseRiderProfile.mockReturnValue({ profile: null, loading: true });
    renderRoute();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows a loading indicator while user is set but profile is still loading', () => {
    mockUseAuth.mockReturnValue({ user: makeAuthUser(), loading: false });
    mockUseRiderProfile.mockReturnValue({ profile: null, loading: true });
    renderRoute();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects to /rider/login when there is no authenticated user', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUseRiderProfile.mockReturnValue({ profile: null, loading: false });
    renderRoute();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /rider/login when user has no rider profile', () => {
    mockUseAuth.mockReturnValue({ user: makeAuthUser(), loading: false });
    mockUseRiderProfile.mockReturnValue({ profile: null, loading: false });
    renderRoute();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows "Awaiting approval" when rider is not yet approved', () => {
    mockUseAuth.mockReturnValue({ user: makeAuthUser(), loading: false });
    mockUseRiderProfile.mockReturnValue({
      profile: makeRiderProfile({ is_approved: false }),
      loading: false,
    });
    renderRoute();
    expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows "Account deactivated" when rider is approved but not active', () => {
    mockUseAuth.mockReturnValue({ user: makeAuthUser(), loading: false });
    mockUseRiderProfile.mockReturnValue({
      profile: makeRiderProfile({ is_approved: true, is_active: false }),
      loading: false,
    });
    renderRoute();
    expect(screen.getByText(/account deactivated/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when rider is approved and active', () => {
    mockUseAuth.mockReturnValue({ user: makeAuthUser(), loading: false });
    mockUseRiderProfile.mockReturnValue({
      profile: makeRiderProfile({ is_approved: true, is_active: true }),
      loading: false,
    });
    renderRoute();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
