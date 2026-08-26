import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MenuItemCard from './MenuItemCard';
import type { MenuItem } from '../types';

const ENDPOINT = 'https://ik.imagekit.io/hvqkkhesl';
const IK_URL = `${ENDPOINT}/menu-items/burger.jpg`;
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

beforeEach(() => {
  (import.meta.env as Record<string, unknown>).VITE_IMAGEKIT_URL_ENDPOINT = ENDPOINT;
});

describe('MenuItemCard image', () => {
  it('serves the card image resized for the card, not at full resolution', () => {
    // Arrange / Act
    renderCard(makeItem({ image: IK_URL }));

    // Assert
    const img = screen.getByAltText('Cheeseburger');
    expect(img.getAttribute('src')).toContain('tr=w-');
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
    renderCard(makeItem({ image: IK_URL }));

    // Act
    fireEvent.error(screen.getByAltText('Cheeseburger'));

    // Assert
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByAltText('Cheeseburger')).not.toBeInTheDocument();
  });
});
