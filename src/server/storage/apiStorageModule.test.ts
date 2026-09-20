import { describe, expect, it } from 'vitest';
import * as storageRoute from '../../../api/storage';

// Vercel's Node.js runtime only treats a route as a Web handler when it exports the
// `fetch` Web Standard shape. A bare default-exported function is read as the legacy
// (req, res) Node handler, which would hand this route an IncomingMessage instead of a
// Request and fail on every call. This test pins the shape the runtime requires.
describe('api/storage module contract', () => {
  it('exports the fetch Web Standard handler', () => {
    const route = storageRoute.default as { fetch?: unknown };
    expect(typeof route.fetch).toBe('function');
  });

  it('does not declare the edge runtime, which cannot pin connections', () => {
    const config = (storageRoute as { config?: { runtime?: string } }).config;
    expect(config?.runtime).not.toBe('edge');
  });

  it('accepts a Web Request and reports missing configuration without leaking detail', async () => {
    const route = storageRoute.default as { fetch(request: Request): Promise<Response> };
    const response = await route.fetch(
      new Request('https://app.test/api/storage', { method: 'POST' }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Storage service is not configured',
    });
  });
});
