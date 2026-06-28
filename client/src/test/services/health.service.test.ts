import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healthService } from '@/services/health.service';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.fetch = mockFetch;
});

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) } as Response);
}

describe('healthService.serverHealth', () => {
  it('sends GET to health endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ status: 'ok', uptime: 123, timestamp: '2026-01-01T00:00:00Z' }));
    const result = await healthService.serverHealth();
    expect(result).toEqual({ status: 'ok', uptime: 123, timestamp: '2026-01-01T00:00:00Z' });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/health', {
      headers: { Accept: 'application/json' },
    });
  });
});

describe('healthService.authleteHealth', () => {
  it('sends GET to authlete health endpoint', async () => {
    mockFetch.mockResolvedValue(ok({ healthy: true }));
    const result = await healthService.authleteHealth(false);
    expect(result).toEqual({ healthy: true });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/health/authlete', {
      headers: { Accept: 'application/json' },
    });
  });

  it('appends extended=true when requested', async () => {
    mockFetch.mockResolvedValue(ok({ healthy: true, statusCode: 200 }));
    const result = await healthService.authleteHealth(true);
    expect(result).toEqual({ healthy: true, statusCode: 200 });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/health/authlete?extended=true', {
      headers: { Accept: 'application/json' },
    });
  });
});
