// src/utils/domainChecks.ts
// DNS + certificate helpers used by scanners.
// IMPORTANT: Browsers cannot perform DNS lookups directly.
// We call our own Azure Functions endpoints which use the platform DNS resolvers.

export type DNSRecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME';

type DnsApiResponse =
  | { ok: true; name: string; type: DNSRecordType; answers: string[] }
  | { ok: false; error: string };

type CertificatesApiResponse =
  | { ok: true; host: string; certificates: unknown }
  | { ok: false; error: string };

function apiUrl(path: string, params: Record<string, string>) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

/**
 * Generic DNS fetcher (calls /api/dns).
 * Uses the server-side resolver (Azure Functions / Node), not dns.google.
 */
export async function fetchDNS(name: string, type: DNSRecordType): Promise<string[]> {
  const url = apiUrl('/api/dns', { name, type });

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`DNS lookup failed (${res.status})`);
  }

  const data = (await res.json()) as DnsApiResponse;

  if (!data || data.ok !== true) {
    const msg = data && 'error' in data ? data.error : 'Unknown DNS API error';
    throw new Error(msg);
  }

  return Array.isArray(data.answers) ? data.answers : [];
}

// Backwards/explicit helpers used by scanners:
export const fetchA = (name: string) => fetchDNS(name, 'A');
export const fetchAAAA = (name: string) => fetchDNS(name, 'AAAA');
export const fetchMX = (name: string) => fetchDNS(name, 'MX');
export const fetchTXT = (name: string) => fetchDNS(name, 'TXT');
export const fetchCNAME = (name: string) => fetchDNS(name, 'CNAME');

/**
 * Certificates fetcher (calls /api/certificates).
 * Your existing function already exposes this route (per your ping working).
 */
export async function fetchCertificates(host: string): Promise<unknown> {
  const url = apiUrl('/api/certificates', { host });

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`Certificates lookup failed (${res.status})`);
  }

  const data = (await res.json()) as CertificatesApiResponse;

  if (!data || data.ok !== true) {
    const msg = data && 'error' in data ? data.error : 'Unknown certificates API error';
    throw new Error(msg);
  }

  return data.certificates;
}
