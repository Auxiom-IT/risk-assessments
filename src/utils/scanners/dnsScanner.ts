import type { DomainScanner } from '../domainscan';
import { fetchDNS } from '../domainChecks';

type DnsAggregate = {
  A: string[];
  AAAA: string[];
  MX: Array<{ priority: number; exchange: string }>;
  TXT: string[];
  CNAME: string[];
};

export const dnsScanner: DomainScanner = {
  id: 'dns',
  label: 'DNS Records',
  description: 'Retrieves A, AAAA, MX, TXT, CNAME records and validates configuration',
  dataSource: {
    name: 'Auxiom DNS Resolver',
    url: '/api/dns/resolve',
  },
  run: async (domain: string) => {
    // IMPORTANT: the DNS function requires a record type. If type is omitted
    // the request becomes `type=undefined` and your API returns an error.
    const [a, aaaa, mx, txt, cname] = await Promise.all([
      fetchDNS(domain, 'A'),
      fetchDNS(domain, 'AAAA'),
      fetchDNS(domain, 'MX'),
      fetchDNS(domain, 'TXT'),
      fetchDNS(domain, 'CNAME'),
    ]);

    const data: DnsAggregate = {
      A: Array.isArray(a) ? (a as string[]) : [],
      AAAA: Array.isArray(aaaa) ? (aaaa as string[]) : [],
      MX: Array.isArray(mx) ? (mx as Array<{ priority: number; exchange: string }>) : [],
      TXT: Array.isArray(txt) ? (txt as string[]) : [],
      CNAME: Array.isArray(cname) ? (cname as string[]) : [],
    };

    const issues: string[] = [];

    // Basic sanity checks (keeps your current UI behavior, just prevents false “failed”)
    const total =
      data.A.length + data.AAAA.length + data.MX.length + data.TXT.length + data.CNAME.length;

    if (total === 0) {
      issues.push('No DNS records found.');
    }

    const summary = `Found A:${data.A.length}, AAAA:${data.AAAA.length}, MX:${data.MX.length}, TXT:${data.TXT.length}, CNAME:${data.CNAME.length}`;

    return {
      summary,
      data,
      issues,
    };
  },
};

export function interpretDnsResult(result: any) {
  if (result?.status === 'error') {
    return {
      severity: 'error' as const,
      message: 'DNS lookup failed.',
      recommendation: 'Please try again later or check your network connection.',
    };
  }

  const issuesCount = (result?.issues ?? []).length;
  if (issuesCount > 0) {
    return {
      severity: 'warning' as const,
      message: 'DNS records found with warnings.',
      recommendation: 'Review your DNS records and correct any missing/misconfigured entries.',
    };
  }

  return {
    severity: 'success' as const,
    message: 'DNS records retrieved successfully.',
    recommendation: 'No DNS issues detected.',
  };
}
