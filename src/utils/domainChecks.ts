// Client-side domain assessment utilities.
// IMPORTANT: DNS lookups are performed via our SWA Functions API (server-side),
// so we use the runtime/system resolver instead of dns.google.

export interface DNSRecordResult {
  type: string;
  data: string[];
}

export interface DomainScanResult {
  domain: string;
  timestamp: string;
  dns: DNSRecordResult[];
  spf?: string;
  dmarc?: string;
  dkimSelectorsFound: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  certificates?: any[]; // Raw crt.sh JSON rows
  issues: string[]; // Derived issue strings
}

type DnsApiResponse = {
  type: string;
  data: string[];
};

// Server-side DNS resolver (Azure SWA Function).
// This avoids CORS issues and avoids relying on dns.google.
// Function route: /api/dns/resolve?name=example.com&type=TXT
export const fetchDNS = async (domain: string, rrtype: string): Promise<DNSRecordResult | null> => {
  try {
    const url = `/api/dns/resolve?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(rrtype)}`;
    const res = await fetch(url);

    if (!res.ok) return { type: rrtype, data: [] };

    const json = (await res.json()) as Partial<DnsApiResponse>;
    const data = Array.isArray(json.data) ? json.data.filter((d) => typeof d === 'string') : [];

    return { type: rrtype, data };
  } catch {
    return null;
  }
};

// --- Convenience wrappers (your scanners were importing these) ---
export const fetchA = async (domain: string): Promise<string[]> => {
  const rec = await fetchDNS(domain, 'A');
  return rec?.data || [];
};

export const fetchAAAA = async (domain: string): Promise<string[]> => {
  const rec = await fetchDNS(domain, 'AAAA');
  return rec?.data || [];
};

export const fetchCNAME = async (domain: string): Promise<string[]> => {
  const rec = await fetchDNS(domain, 'CNAME');
  return rec?.data || [];
};

export const fetchMX = async (domain: string): Promise<string[]> => {
  const rec = await fetchDNS(domain, 'MX');
  return rec?.data || [];
};

export const fetchTXT = async (domain: string): Promise<string[]> => {
  const rec = await fetchDNS(domain, 'TXT');
  return rec?.data || [];
};

export const extractSPF = (txtRecords: string[]): string | undefined => {
  return txtRecords.find((r) => r.toLowerCase().startsWith('v=spf1'));
};

export const fetchDMARC = async (domain: string): Promise<string | undefined> => {
  const name = `_dmarc.${domain}`;
  const txt = await fetchTXT(name);
  return txt.find((t) => t.toLowerCase().includes('v=dmarc'));
};

export const checkDKIM = async (domain: string, customSelectors?: string[]): Promise<string[]> => {
  const defaultSelectors = [
    // Generic/Common
    'default',
    'dkim',
    'mail',
    'email',
    'smtp',

    // Google Workspace / Gmail
    'google',
    'googlemail',

    // Microsoft 365 / Office 365
    'selector1',
    'selector2',

    // Common patterns
    'k1',
    'k2',
    'k3',
    's1',
    's2',
    's3',
    'key1',
    'key2',
    'key3',
    'dkim1',
    'dkim2',
    'dkim3',

    // Marketing platforms
    'mailgun',
    'sendgrid',
    'mandrill',
    'sparkpost',
    'mta',
    'mta1',
    'mta2',
    'pm',
    'pm1',
    'pm2', // Postmark
    'em',
    'em1',
    'em2', // Email service providers

    // Other common patterns
    'mx',
    'mx1',
    'mx2',
    'smtpapi',
    'api',
    'marketing',
    'transactional',
  ];

  const selectors = customSelectors && customSelectors.length > 0 ? customSelectors : defaultSelectors;

  const checks = selectors.map(async (sel) => {
    const name = `${sel}._domainkey.${domain}`;
    const txt = await fetchTXT(name);

    if (
      txt.some((t) => {
        if (t.includes('v=DKIM1')) return true;
        const pMatch = t.match(/p=([^;\s]+)/);
        return pMatch && pMatch[1] && pMatch[1].length > 0;
      })
    ) {
      return sel;
    }
    return null;
  });

  const results = await Promise.all(checks);
  return results.filter((r): r is string => r !== null);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchCertificates = async (domain: string): Promise<any[] | undefined> => {
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
};

export const deriveIssues = (scan: Partial<DomainScanResult>): string[] => {
  const issues: string[] = [];
  if (scan.spf === undefined) issues.push('Missing SPF record');
  if (scan.dmarc === undefined) issues.push('Missing DMARC record');
  if ((scan.dkimSelectorsFound || []).length === 0) issues.push('No DKIM selectors detected (heuristic)');
  return issues;
};
