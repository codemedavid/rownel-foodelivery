import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptimizedImage from './OptimizedImage';

const ENDPOINT = 'https://ik.imagekit.io/hvqkkhesl';
const IK_URL = `${ENDPOINT}/menu-items/burger.jpg`;
const CLOUDINARY_URL =
  'https://res.cloudinary.com/demo/image/upload/v1/menu-items/menu_123.jpg';

beforeEach(() => {
  (import.meta.env as Record<string, unknown>).VITE_IMAGEKIT_URL_ENDPOINT = ENDPOINT;
});

describe('OptimizedImage', () => {
  it('requests an ImageKit-resized image at the rendered width', () => {
    // Arrange / Act
    render(<OptimizedImage src={IK_URL} alt="Burger" width={400} />);

    // Assert
    const img = screen.getByAltText('Burger');
    expect(img).toHaveAttribute('src', expect.stringContaining('tr=w-400'));
  });

  it('offers a 2x source for high density displays', () => {
    // Arrange / Act
    render(<OptimizedImage src={IK_URL} alt="Burger" width={400} />);

    // Assert
    const img = screen.getByAltText('Burger');
    expect(img.getAttribute('srcSet')).toContain('2x');
    expect(img.getAttribute('srcSet')).toContain('w-800');
  });

  it('renders legacy Cloudinary images unchanged and without a srcSet', () => {
    // Arrange / Act
    render(<OptimizedImage src={CLOUDINARY_URL} alt="Legacy" width={400} />);

    // Assert
    const img = screen.getByAltText('Legacy');
    expect(img).toHaveAttribute('src', CLOUDINARY_URL);
    expect(img.getAttribute('srcSet')).toBeNull();
  });

  it('lazy loads by default and eagerly loads when marked priority', () => {
    // Arrange / Act
    const { rerender } = render(<OptimizedImage src={IK_URL} alt="Burger" width={400} />);

    // Assert
    expect(screen.getByAltText('Burger')).toHaveAttribute('loading', 'lazy');

    // Act
    rerender(<OptimizedImage src={IK_URL} alt="Burger" width={400} isPriority />);

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
      <OptimizedImage src={IK_URL} alt="Broken" width={400} fallback={<span>No image</span>} />
    );

    // Act
    fireEvent.error(screen.getByAltText('Broken'));

    // Assert
    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('forwards className and passes through extra img attributes', () => {
    // Arrange / Act
    render(
      <OptimizedImage src={IK_URL} alt="Burger" width={400} className="rounded-lg" title="Tasty" />
    );

    // Assert
    const img = screen.getByAltText('Burger');
    expect(img).toHaveClass('rounded-lg');
    expect(img).toHaveAttribute('title', 'Tasty');
  });
});
