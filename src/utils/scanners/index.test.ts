import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCANNERS,
  runAllScanners,
  runScanner,
  interpretScannerResult,
  setScannerTimeout,
} from './index';

// Mock fetch globally
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SCANNERS', () => {
  it('should export array of scanners', () => {
    expect(SCANNERS).toBeDefined();
    expect(Array.isArray(SCANNERS)).toBe(true);
    expect(SCANNERS.length).toBeGreaterThan(0);
  });

  it('should have scanners with required properties', () => {
    SCANNERS.forEach((scanner) => {
      expect(scanner.id).toBeDefined();
      expect(scanner.label).toBeDefined();
      expect(scanner.description).toBeDefined();
      expect(typeof scanner.run).toBe('function');
    });
  });

  it('should have unique scanner IDs', () => {
    const ids = SCANNERS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('should have all expected scanners', () => {
    const expectedIds = ['dns', 'emailAuth', 'certificates', 'rdap', 'securityHeaders'];
    expectedIds.forEach((id) => {
      expect(SCANNERS.find((s) => s.id === id)).toBeDefined();
    });
  });
});

describe('setScannerTimeout', () => {
  it('should reject invalid timeout values', () => {
    expect(() => setScannerTimeout(0)).toThrow('Invalid timeout value');
    expect(() => setScannerTimeout(-1)).toThrow('Invalid timeout value');
    expect(() => setScannerTimeout(Infinity)).toThrow('Invalid timeout value');
  });

  it('should accept valid timeout values', () => {
    expect(() => setScannerTimeout(1000)).not.toThrow();
    expect(() => setScannerTimeout(30000)).not.toThrow();
  });
});

describe('runAllScanners', () => {
  beforeEach(() => {
    // Mock all fetch calls to return empty responses
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url) => {
      const urlStr = url.toString();

      // Mock certificate scanner (crt.sh)
      if (urlStr.includes('crt.sh')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }

      // Mock IANA RDAP bootstrap service
      if (urlStr.includes('data.iana.org/rdap/dns.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            services: [
              [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
              [['org'], ['https://rdap.publicinterestregistry.org/']],
            ],
          }),
        });
      }

      // Default mock response
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
  });

  it('should run all scanners and return results', async () => {
    const result = await runAllScanners('example.com');

    expect(result).toBeDefined();
    expect(result.domain).toBe('example.com');
    expect(result.scanners).toBeDefined();
    expect(Array.isArray(result.scanners)).toBe(true);
    expect(result.scanners.length).toBe(SCANNERS.length);
  });

  it('should call onProgress callback as scanners complete', async () => {
    const onProgress = vi.fn();

    await runAllScanners('example.com', onProgress);

    expect(onProgress).toHaveBeenCalled();
    const lastCallArgs = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(lastCallArgs.length).toBe(SCANNERS.length);
  });
});

describe('runScanner', () => {
  beforeEach(() => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it('should run a specific scanner by ID', async () => {
    const result = await runScanner('dns', 'example.com');

    expect(result).toBeDefined();
    expect(result.id).toBe('dns');
    expect(result.status).toBeDefined();
  });

  it('should throw error for unknown scanner ID', async () => {
    await expect(runScanner('unknown', 'example.com')).rejects.toThrow();
  });
});

describe('interpretScannerResult', () => {
  it('should return error interpretation for scanner errors', () => {
    const scanner = {
      id: 'dns',
      label: 'dns.label',
      status: 'error' as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: 'Test error',
    };

    const interpretation = interpretScannerResult(scanner);

    expect(interpretation.severity).toBe('error');
    expect(interpretation.message).toContain('Test error');
  });

  it('should return success for unknown scanner with no issues', () => {
    const scanner = {
      id: 'unknown',
      label: 'unknown.label',
      status: 'complete' as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      data: {},
      issues: [],
    };

    const interpretation = interpretScannerResult(scanner);

    expect(interpretation.severity).toBe('success');
  });

  it('should return warning for unknown scanner with issues', () => {
    const scanner = {
      id: 'unknown',
      label: 'unknown.label',
      status: 'complete' as const,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      data: {},
      issues: ['issue 1'],
    };

    const interpretation = interpretScannerResult(scanner);

    expect(interpretation.severity).toBe('warning');
  });
});
