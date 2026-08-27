import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomNav from './BottomNav';

const mockCart = { getTotalItems: vi.fn(() => 0) };

vi.mock('../contexts/CartContext', () => ({
  useCartContext: () => mockCart,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe('BottomNav', () => {
  it('renders Home, Orders, Cart and Profile tabs', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument();
  });

  it('marks the tab matching the current route as current', () => {
    renderAt('/orders');
    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('shows a badge with the cart item count when the cart has items', () => {
    mockCart.getTotalItems.mockReturnValue(3);
    renderAt('/');
    expect(screen.getByText('3')).toBeInTheDocument();
    mockCart.getTotalItems.mockReturnValue(0);
  });

  it('hides the badge when the cart is empty', () => {
    mockCart.getTotalItems.mockReturnValue(0);
    renderAt('/');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it.each(['/admin', '/admin/login', '/staff/orders', '/rider/dashboard'])(
    'renders nothing on operational route %s',
    (path) => {
      const { container } = renderAt(path);
      expect(container).toBeEmptyDOMElement();
    }
  );
});
