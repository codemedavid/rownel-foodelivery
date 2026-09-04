import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuItemCard from './MenuItemCard';
import type { MenuItem } from '../types';

const IMAGE_URL =
  'https://apbmremibgwoyrddjhcg.supabase.co/storage/v1/object/public/menu-images/menu-items/burger.jpg';
const PLACEHOLDER = '☕';

const makeItem = (overrides: Partial<MenuItem> = {}): MenuItem => ({
  id: 'item-1',
  merchantId: 'merchant-1',
  name: 'Cheeseburger',
  description: 'A burger',
  basePrice: 150,
  category: 'mains',
  available: true,
  ...overrides,
});

const renderCard = (item: MenuItem) =>
  render(
    <MenuItemCard
      item={item}
      quantity={0}
      onUpdateQuantity={vi.fn()}
      onOpenDetails={vi.fn()}
    />
  );

describe('MenuItemCard image', () => {
  it('renders the stored image lazily', () => {
    // Arrange / Act
    renderCard(makeItem({ image: IMAGE_URL }));

    // Assert
    const img = screen.getByAltText('Cheeseburger');
    expect(img).toHaveAttribute('src', IMAGE_URL);
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('shows the placeholder when the item has no image', () => {
    // Arrange / Act
    renderCard(makeItem());

    // Assert
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByAltText('Cheeseburger')).not.toBeInTheDocument();
  });

  it('falls back to the placeholder when the image fails to load', () => {
    // Arrange
    renderCard(makeItem({ image: IMAGE_URL }));

    // Act
    fireEvent.error(screen.getByAltText('Cheeseburger'));

    // Assert
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByAltText('Cheeseburger')).not.toBeInTheDocument();
  });
});
