import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import AdminMobileNav from './AdminMobileNav';

describe('AdminMobileNav', () => {
  it('renders quick links to the core admin sections', () => {
    render(<AdminMobileNav currentView="dashboard" onSelect={vi.fn()} />);
    for (const label of ['Overview', 'Orders', 'Menu Items', 'Merchants', 'Riders', 'Earnings']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('invokes onSelect with the section key when a chip is tapped', async () => {
    const onSelect = vi.fn();
    render(<AdminMobileNav currentView="dashboard" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(onSelect).toHaveBeenCalledWith('orders');
  });

  it('marks the active section chip as pressed', () => {
    render(<AdminMobileNav currentView="orders" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Orders' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'false');
  });
});
