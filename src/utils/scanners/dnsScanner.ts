import type { DomainScanner } from '../domainscan';
import { fetchDNS } from '../domainChecks';

export const dnsScanner: DomainScanner = {
  id: 'dns',
  label: 'DNS Records',
  description: 'Retrieves A, AAAA, MX, TXT, CNAME records and validates configuration',
  dataSource: {
    name: 'System DNS (server-side)',
    url: 'https://nodejs.org/api/dns.html',
  },
  run: async (domain: string) => {
    const results = await fetchDNS(domain);

    const summary = [
      `Found A:${results.A.length}, AAAA:${results.AAAA.length}, MX:${results.MX.length}, TXT:${results.TXT.length}, CNAME:${results.CNAME.length}`,
    ].join(' ');

    const issues: string[] = [];
    if (results.MX.length === 0) issues.push('No MX records found (email delivery may fail)');
    if (results.TXT.length === 0) issues.push('No TXT records found (SPF/DMARC/DKIM checks may be limited)');

    return {
      data: results,
      summary,
      issues,
    };
  },
};

export const interpretDnsResult = (result: any) => {
  if (result?.issues?.length) {
    return {
      severity: 'warning',
      message: 'DNS records retrieved with warnings.',
      recommendation: 'Review missing records and add recommended DNS entries.',
    };
  }
  return {
    severity: 'success',
    message: 'DNS records retrieved successfully.',
    recommendation: "Your domain's DNS configuration is accessible and responding normally.",
  };
};
