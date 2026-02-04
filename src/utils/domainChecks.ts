// Centralized fetchers for DNS + certificate-related checks.
// IMPORTANT: Browsers cannot do raw DNS lookups directly.
// To avoid dns.google entirely, we call our SWA API (/api/dns/resolve)
// which uses Node's built-in DNS resolver (runtime-configured DNS).

export type Answer = {
  data: string;
  TTL: number;
};

export type DNSResponse = {
  Answer?: Answer[];
};

const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'CNAME'] as const;
type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

/**
 * Calls our server-side DNS resolver.
 * This uses the platform/runtime configured DNS, not dns.google.
 */
const fetchFromDnsApi = async (name: string, type: DnsRecordType): Promise<DNSResponse> => {
  const url = `/api/dns/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    // Avoid throwing opaque errors; include status for UI/debugging
    const text = await res.text().catch(() => '');
    throw new Error(`DNS API error (${res.status}) ${text || ''}`.trim());
  }

  return (await res.json()) as DNSResponse;
};

// This shape is used by your scanners to build per-record summaries.
export interface DNSResults {
  A: Answer[];
  AAAA: Answer[];
  MX: Answer[];
  TXT: Answer[];
  CNAME: Answer[];
}

export const fetchDNS = async (domain: string): Promise<DNSResults> => {
  const [A, AAAA, MX, TXT, CNAME] = await Promise.all([
    fetchFromDnsApi(domain, 'A').then((r) => r.Answer ?? []),
    fetchFromDnsApi(domain, 'AAAA').then((r) => r.Answer ?? []),
    fetchFromDnsApi(domain, 'MX').then((r) => r.Answer ?? []),
    fetchFromDnsApi(domain, 'TXT').then((r) => r.Answer ?? []),
    fetchFromDnsApi(domain, 'CNAME').then((r) => r.Answer ?? []),
  ]);

  return { A, AAAA, MX, TXT, CNAME };
};

// Certificate transparency lookup (kept as-is)
export const fetchCertificates = async (domain: string) => {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Certificate lookup failed');
  return response.json();
};
