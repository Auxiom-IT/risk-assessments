// Utility functions for DNS lookups used by multiple scanners.
//
// NOTE: We intentionally do NOT use public DNS-over-HTTPS resolvers (e.g. dns.google).
// In the browser you can't do true DNS queries, so we route DNS lookups through our SWA
// Azure Function at /api/dns, which uses the platform's configured DNS resolver.

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT';

export type DNSRecordResult = {
  type: DnsRecordType;
  data: string[];
};

type GoogleDnsLikeResponse = {
  Status?: number;
  Answer?: Array<{ data?: string }>;
};

// Use the SWA API function (/api/dns) for DNS resolution.
async function fetchDNS(domain: string, type: DnsRecordType): Promise<DNSRecordResult | null> {
  try {
    const url = `/api/dns?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;
    const response = await fetch(url, {
      // Avoid cached stale results between scans
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const json = (await response.json()) as GoogleDnsLikeResponse;

    // If no Answer field, treat as "no records"
    if (!json.Answer || !Array.isArray(json.Answer)) {
      return { type, data: [] };
    }

    const records = json.Answer
      .map((a) => (a?.data ?? '').toString())
      .filter((v) => v.length > 0);

    return { type, data: records };
  } catch {
    return null;
  }
}

export async function fetchTXT(domain: string): Promise<string[]> {
  const result = await fetchDNS(domain, 'TXT');
  return result?.data ?? [];
}

export async function fetchMX(domain: string): Promise<string[]> {
  const result = await fetchDNS(domain, 'MX');
  return result?.data ?? [];
}

export async function fetchA(domain: string): Promise<string[]> {
  const result = await fetchDNS(domain, 'A');
  return result?.data ?? [];
}

export async function fetchAAAA(domain: string): Promise<string[]> {
  const result = await fetchDNS(domain, 'AAAA');
  return result?.data ?? [];
}

export async function fetchCNAME(domain: string): Promise<string[]> {
  const result = await fetchDNS(domain, 'CNAME');
  return result?.data ?? [];
}
