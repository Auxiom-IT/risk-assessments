// src/utils/domainChecks.ts
// Centralized network checks used by scanners.
// IMPORTANT:
// - DNS is resolved via our own /api/dns/resolve endpoint (system resolver), not dns.google.
// - Certificates / SecurityHeaders / SSL Labs still call their respective public endpoints.

type DNSResult = { type: string; data: string[] };

// Helper to keep same-origin API calls working in SWA (front-end -> /api/*).
function apiUrl(path: string): string {
  // Ensure we don't accidentally double-slash if base is empty.
  return path.startsWith('/') ? path : `/${path}`;
}

export const fetchDNS = async (domain: string, type: string): Promise<DNSResult | null> => {
  try {
    const url = apiUrl(
      `/api/dns/resolve?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`
    );

    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!resp.ok) return null;

    const json = (await resp.json()) as { records?: unknown };

    const records =
      Array.isArray(json.records) ? json.records.filter((r): r is string => typeof r === 'string') : [];

    return { type, data: records };
  } catch {
    return null;
  }
};

export const fetchEmailAuth = async (domain: string) => {
  // Example behavior in this project: the emailAuth scanner uses DNS TXT/MX lookups.
  // Keep this as-is if other code calls fetchEmailAuth directly; otherwise scanners do direct DNS calls.
  const mx = await fetchDNS(domain, 'MX');
  const txt = await fetchDNS(domain, 'TXT');

  return {
    mx: mx?.data ?? [],
    txt: txt?.data ?? [],
  };
};

export const fetchCertificates = async (host: string) => {
  // crt.sh query; returns list of cert entries in JSON format.
  // (You can switch this later if you want a different source.)
  const url = `https://crt.sh/?q=${encodeURIComponent(host)}&output=json`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!resp.ok) {
    throw new Error(`crt.sh request failed (${resp.status})`);
  }

  // crt.sh sometimes returns duplicate objects; caller can dedupe if desired.
  return resp.json();
};

export const fetchSecurityHeaders = async (domain: string) => {
  // Uses securityheaders.com public endpoint (as this project originally did).
  // Note: if you need to avoid their rate limits, we can proxy this via /api later.
  const url = `https://securityheaders.com/?q=${encodeURIComponent(domain)}&followRedirects=on`;
  const resp = await fetch(url, { redirect: 'follow' });

  if (!resp.ok) {
    throw new Error(`SecurityHeaders request failed (${resp.status})`);
  }

  return resp.text();
};

export const fetchSslLabs = async (host: string, all: 'on' | 'done' = 'done') => {
  // SSL Labs API requires all=on|done only.
  const url = `https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(host)}&all=${all}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!resp.ok) {
    // SSL Labs returns friendly JSON errors sometimes, but not always.
    const txt = await resp.text().catch(() => '');
    throw new Error(`SSL Labs request failed (${resp.status}) ${txt}`.trim());
  }

  return resp.json();
};
