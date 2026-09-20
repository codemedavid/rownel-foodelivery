import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const load = vi.fn();

vi.mock('@apple/mapkit-loader', () => ({
  load: (...args: unknown[]) => load(...args),
}));

/** A stand-in for the `mapkit` namespace, which is an EventTarget. */
const createMapkitStub = () => {
  const target = new EventTarget() as EventTarget & {
    init: ReturnType<typeof vi.fn>;
  };
  target.init = vi.fn();
  return target;
};

const announceReady = (stub: EventTarget) =>
  stub.dispatchEvent(new Event('configuration-change'));

const importFresh = async () => {
  vi.resetModules();
  return import('./loadMapkit');
};

describe('loadMapkit', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    load.mockReset();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => 'test.jwt.token' });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses a token issued by the Apple dashboard when one is configured', async () => {
    // Arrange — the static route needs no signing endpoint at all
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    vi.stubEnv('VITE_MAPKIT_TOKEN', 'dashboard.issued.token');
    const { loadMapkit } = await importFresh();

    // Act
    await expect(loadMapkit()).resolves.toBe(stub);

    // Assert
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'dashboard.issued.token' })
    );
    expect(stub.init).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the signing endpoint when no static token is configured', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    vi.stubEnv('VITE_MAPKIT_TOKEN', '');
    const { loadMapkit } = await importFresh();

    // Act
    const pending = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    announceReady(stub);
    await pending;

    // Assert
    expect(load).toHaveBeenCalledWith(expect.not.objectContaining({ token: expect.anything() }));
  });

  it('loads only the libraries this app uses', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    const { loadMapkit } = await importFresh();

    // Act
    const pending = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    announceReady(stub);
    await pending;

    // Assert — a full load ships map rendering the address form never uses
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({ libraries: ['services', 'full-map'] })
    );
  });

  it('authorises through the app’s own token endpoint, never a bundled key', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    const { loadMapkit } = await importFresh();

    // Act
    const pending = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    const { authorizationCallback } = stub.init.mock.calls[0][0];
    const done = vi.fn();
    await authorizationCallback(done);
    announceReady(stub);
    await pending;

    // Assert
    expect(fetchMock).toHaveBeenCalledWith('/api/mapkit-token', expect.anything());
    expect(done).toHaveBeenCalledWith('test.jwt.token');
  });

  it('resolves once MapKit reports it is configured', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    const { loadMapkit } = await importFresh();

    // Act
    const pending = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    announceReady(stub);

    // Assert
    await expect(pending).resolves.toBe(stub);
  });

  it('loads once however many components ask for it', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    const { loadMapkit } = await importFresh();

    // Act — a map and an address field mounting together
    const first = loadMapkit();
    const second = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    announceReady(stub);
    await Promise.all([first, second]);

    // Assert
    expect(load).toHaveBeenCalledTimes(1);
    expect(stub.init).toHaveBeenCalledTimes(1);
  });

  it('rejects when MapKit reports an initialisation error', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    const { loadMapkit } = await importFresh();

    // Act
    const pending = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    stub.dispatchEvent(new Event('error'));

    // Assert
    await expect(pending).rejects.toThrow(/could not start/i);
  });

  it('lets the next caller retry after a failure instead of caching it forever', async () => {
    // Arrange
    const failing = createMapkitStub();
    load.mockResolvedValueOnce(failing);
    const { loadMapkit } = await importFresh();
    const firstAttempt = loadMapkit();
    await vi.waitFor(() => expect(failing.init).toHaveBeenCalled());
    failing.dispatchEvent(new Event('error'));
    await expect(firstAttempt).rejects.toThrow();

    // Act — a transient token outage should not disable the map for the session
    const working = createMapkitStub();
    load.mockResolvedValueOnce(working);
    const retry = loadMapkit();
    await vi.waitFor(() => expect(working.init).toHaveBeenCalled());
    announceReady(working);

    // Assert
    await expect(retry).resolves.toBe(working);
  });

  it('surfaces a failing token endpoint rather than hanging on a silent callback', async () => {
    // Arrange
    const stub = createMapkitStub();
    load.mockResolvedValue(stub);
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const { loadMapkit } = await importFresh();

    // Act
    const pending = loadMapkit();
    await vi.waitFor(() => expect(stub.init).toHaveBeenCalled());
    const { authorizationCallback } = stub.init.mock.calls[0][0];
    const done = vi.fn();
    await authorizationCallback(done);

    // Assert — done() is never called with a bogus token
    expect(done).not.toHaveBeenCalled();
    await expect(pending).rejects.toThrow(/token/i);
  });
});
