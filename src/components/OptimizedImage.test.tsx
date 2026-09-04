import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptimizedImage from './OptimizedImage';

const IMAGE_URL =
  'https://apbmremibgwoyrddjhcg.supabase.co/storage/v1/object/public/menu-images/menu-items/burger.jpg';

describe('OptimizedImage', () => {
  it('renders the source unchanged with a width attribute for layout stability', () => {
    // Arrange / Act
    render(<OptimizedImage src={IMAGE_URL} alt="Burger" width={400} />);

    // Assert
    const img = screen.getByAltText('Burger');
    expect(img).toHaveAttribute('src', IMAGE_URL);
    expect(img).toHaveAttribute('width', '400');
  });

  it('lazy loads by default and eagerly loads when marked priority', () => {
    // Arrange / Act
    const { rerender } = render(<OptimizedImage src={IMAGE_URL} alt="Burger" width={400} />);

    // Assert
    expect(screen.getByAltText('Burger')).toHaveAttribute('loading', 'lazy');

    // Act
    rerender(<OptimizedImage src={IMAGE_URL} alt="Burger" width={400} isPriority />);

    // Assert
    expect(screen.getByAltText('Burger')).toHaveAttribute('loading', 'eager');
  });

  it('renders the fallback when no source is provided', () => {
    // Arrange / Act
    render(<OptimizedImage src={undefined} alt="Missing" width={400} fallback={<span>No image</span>} />);

    // Assert
    expect(screen.getByText('No image')).toBeInTheDocument();
    expect(screen.queryByAltText('Missing')).not.toBeInTheDocument();
  });

  it('swaps to the fallback when the image fails to load', () => {
    // Arrange
    render(
      <OptimizedImage src={IMAGE_URL} alt="Broken" width={400} fallback={<span>No image</span>} />
    );

    // Act
    fireEvent.error(screen.getByAltText('Broken'));

    // Assert
    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('forwards className and passes through extra img attributes', () => {
    // Arrange / Act
    render(
      <OptimizedImage src={IMAGE_URL} alt="Burger" width={400} className="rounded-lg" title="Tasty" />
    );

    // Assert
    const img = screen.getByAltText('Burger');
    expect(img).toHaveClass('rounded-lg');
    expect(img).toHaveAttribute('title', 'Tasty');
  });
});
