// Central helpers for calling our SWA API endpoints for domain-related checks.
// NOTE: These helpers intentionally tolerate multiple response shapes because
// the backend API has evolved over time (dns.js vs dnsResolve.js, etc).

export type DNSRecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'CNAME';

function apiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return url.toString();
}

export async function fetchDNS(name: string, type: DNSRecordType): Promise<string[]> {
  // IMPORTANT:
  // Our current SWA Function route is `dns/resolve` => `/api/dns/resolve`
  const url = apiUrl('/api/dns/resolve', { name, type });

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`DNS lookup failed (${res.status})`);
  }

  const json: any = await res.json();

  // Support multiple response shapes:
  // 1) { ok: true, answers: string[] }
  // 2) { type: "A", data: [{ value: "1.2.3.4", ...}, ...] }
  // 3) { Answer: [{ data: "1.2.3.4", ...}, ...] } (Google-style)
  const answers: unknown =
    Array.isArray(json?.answers) ? json.answers :
    Array.isArray(json?.Answer) ? json.Answer :
    Array.isArray(json?.data) ? json.data :
    [];

  return (answers as any[])
    .map((a) => {
      if (typeof a === 'string') return a;

      if (a && typeof a === 'object') {
        if (typeof (a as any).value === 'string') return (a as any).value;
        if (typeof (a as any).data === 'string') return (a as any).data;
      }

      return '';
    })
    .filter(Boolean);
}

export async function fetchA(name: string) {
  return fetchDNS(name, 'A');
}

export async function fetchAAAA(name: string) {
  return fetchDNS(name, 'AAAA');
}

export async function fetchMX(name: string) {
  return fetchDNS(name, 'MX');
}

export async function fetchTXT(name: string) {
  return fetchDNS(name, 'TXT');
}

export async function fetchCNAME(name: string) {
  return fetchDNS(name, 'CNAME');
}

/**
 * Fetch certificate transparency results for a host.
 * Always returns an array of certificate-like objects (possibly empty).
 * Supports multiple backend response shapes:
 *  1) Array (preferred): [ { ...cert }, ... ]
 *  2) Object wrapper: { certificates: [ ... ] }
 *  3) Nested wrappers from older experiments: { data: [...] } or { result: [...] }
 */
export async function fetchCertificates(host: string): Promise<any[]> {
  const url = apiUrl('/api/certificates', { host });

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`Certificates lookup failed (${res.status})`);
  }

  const json: any = await res.json();

  // Most common: Azure Function returns an array
  if (Array.isArray(json)) return json;

  // Some wrappers used by older versions
  if (Array.isArray(json?.certificates)) return json.certificates;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.result)) return json.result;

  // If it’s an object map (rare), attempt to convert to array of values
  if (json && typeof json === 'object') {
    const values = Object.values(json);
    if (values.length && values.every((v) => typeof v === 'object')) {
      return values as any[];
    }
  }

  // Unknown shape: return empty array (prevents “no certs” false positives from crashing UI)
  return [];
}
