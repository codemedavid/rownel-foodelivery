import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useMapkitMap } from './useMapkitMap';
import { GeocodingError } from '../geocodingError';

const loadMapkit = vi.fn();

vi.mock('./loadMapkit', () => ({ loadMapkit: () => loadMapkit() }));

class FakeMap extends EventTarget {
  destroy = vi.fn();
  convertPointOnPageToCoordinate = vi.fn(() => ({ latitude: 13.9, longitude: 121.6 }));
  constructor(
    public element: HTMLElement,
    public options: Record<string, unknown>
  ) {
    super();
  }
}

const createdMaps: FakeMap[] = [];

const mapkitStub = {
  Map: class extends FakeMap {
    constructor(element: HTMLElement, options: Record<string, unknown>) {
      super(element, options);
      createdMaps.push(this);
    }
  },
};

const Harness: React.FC<{
  onClick?: (coordinate: { latitude: number; longitude: number }) => void;
  isInteractive?: boolean;
}> = ({ onClick, isInteractive }) => {
  const { containerRef, status } = useMapkitMap({
    center: { latitude: 14.5995, longitude: 120.9842 },
    cameraDistance: 1200,
    onClick,
    isInteractive,
  });
  return (
    <>
      <div data-testid="status">{status}</div>
      <div data-testid="container" ref={containerRef} />
    </>
  );
};

describe('useMapkitMap', () => {
  beforeEach(() => {
    createdMaps.length = 0;
    loadMapkit.mockReset();
    loadMapkit.mockResolvedValue(mapkitStub);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports loading before MapKit is ready', () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
  });

  it('builds the map inside the container it is given', async () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    await waitFor(() => expect(createdMaps).toHaveLength(1));
    expect(createdMaps[0].element).toBe(screen.getByTestId('container'));
    expect(screen.getByTestId('status')).toHaveTextContent('ready');
  });

  it('opens on the requested centre and camera distance', async () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    await waitFor(() => expect(createdMaps).toHaveLength(1));
    expect(createdMaps[0].options).toMatchObject({
      center: { latitude: 14.5995, longitude: 120.9842 },
      cameraDistance: 1200,
    });
  });

  it('locks scroll and zoom when the map is only for display', async () => {
    // Arrange / Act
    render(<Harness isInteractive={false} />);

    // Assert
    await waitFor(() => expect(createdMaps).toHaveLength(1));
    expect(createdMaps[0].options).toMatchObject({
      isScrollEnabled: false,
      isZoomEnabled: false,
    });
  });

  it('reports the coordinate under a click, not the raw page point', async () => {
    // Arrange
    const onClick = vi.fn();
    render(<Harness onClick={onClick} />);
    await waitFor(() => expect(createdMaps).toHaveLength(1));

    // Act
    const event = new Event('click') as Event & { pointOnPage: unknown };
    event.pointOnPage = { x: 10, y: 20 };
    createdMaps[0].dispatchEvent(event);

    // Assert
    expect(createdMaps[0].convertPointOnPageToCoordinate).toHaveBeenCalledWith({ x: 10, y: 20 });
    expect(onClick).toHaveBeenCalledWith({ latitude: 13.9, longitude: 121.6 });
  });

  it('tears the map down on unmount so a remount does not leak one', async () => {
    // Arrange
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(createdMaps).toHaveLength(1));

    // Act
    unmount();

    // Assert
    expect(createdMaps[0].destroy).toHaveBeenCalled();
  });

  it('reports failure when MapKit will not start, so the UI can say so', async () => {
    // Arrange
    loadMapkit.mockRejectedValue(new GeocodingError('auth', 'Apple Maps could not start'));

    // Act
    render(<Harness />);

    // Assert
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('failed'));
    expect(createdMaps).toHaveLength(0);
  });
});
