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
 * Normalized certificate shape expected by certificateScanner.ts
 * (matches what your UI logic is already written against).
 */
export type NormalizedCert = {
  subject?: { commonName?: string };
  issuer?: { commonName?: string };
  notBefore?: string; // ISO date string (or parseable)
  notAfter?: string;  // ISO date string (or parseable)
  dnsNames?: string[];
  isSelfSigned?: boolean;
  isWildcard?: boolean;
  isExpired?: boolean;
  isActive?: boolean;
};

/**
 * Convert crt.sh-ish row into NormalizedCert.
 * Your API currently returns rows like:
 * { commonName, nameValue, issuerName, notBefore, notAfter, ... }
 */
function normalizeCrtShRow(row: any): NormalizedCert {
  const cn = typeof row?.commonName === 'string' ? row.commonName : '';
  const issuerName = typeof row?.issuerName === 'string' ? row.issuerName : '';

  // crt.sh returns name_value as newline-separated DNS names
  const nameValue = typeof row?.nameValue === 'string' ? row.nameValue : '';
  const dnsNames = nameValue
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const notBeforeRaw = row?.notBefore ?? row?.not_before ?? null;
  const notAfterRaw = row?.notAfter ?? row?.not_after ?? null;

  const notBefore = notBeforeRaw != null ? String(notBeforeRaw) : undefined;
  const notAfter = notAfterRaw != null ? String(notAfterRaw) : undefined;

  const now = Date.now();
  const nb = notBefore ? Date.parse(notBefore) : NaN;
  const na = notAfter ? Date.parse(notAfter) : NaN;

  const isExpired = Number.isFinite(na) ? na < now : false;
  const isActive =
    Number.isFinite(nb) && Number.isFinite(na) ? nb <= now && now <= na : false;

  const wildcard =
    (cn && cn.startsWith('*.')) || dnsNames.some((n) => n.startsWith('*.'));

  // IMPORTANT: avoid false positives
  // Only mark self-signed when issuer == subject CN and both exist.
  const selfSigned = Boolean(cn && issuerName && issuerName === cn);

  return {
    subject: cn ? { commonName: cn } : undefined,
    issuer: issuerName ? { commonName: issuerName } : undefined,
    notBefore,
    notAfter,
    dnsNames,
    isWildcard: wildcard,
    isExpired,
    isActive,
    isSelfSigned: selfSigned,
  };
}

export async function fetchCertificates(host: string): Promise<NormalizedCert[]> {
  const url = apiUrl('/api/certificates', { host });

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`Certificates lookup failed (${res.status})`);
  }

  const json: any = await res.json();

  // Support multiple response shapes:
  // A) API returns { certificates: [...] }
  // B) API returns [...] (your current crt.sh function does this)
  const rawList: any[] =
    Array.isArray(json?.certificates) ? json.certificates :
    Array.isArray(json) ? json :
    [];

  // If it already looks like the normalized shape, pass through.
  // (i.e., subject/dnsNames exist)
  if (
    rawList.length > 0 &&
    (rawList[0]?.subject || rawList[0]?.dnsNames || rawList[0]?.issuer)
  ) {
    return rawList as NormalizedCert[];
  }

  // Otherwise, assume crt.sh-ish rows and normalize.
  return rawList.map(normalizeCrtShRow);
}
