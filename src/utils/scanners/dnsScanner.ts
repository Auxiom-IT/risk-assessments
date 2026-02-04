import type { DomainScanner } from '../domainscan';
import { fetchA, fetchAAAA, fetchCNAME, fetchMX, fetchTXT } from '../domainChecks';

export const dnsScanner: DomainScanner = {
  id: 'dns',
  label: 'DNS Records',
  description: 'Retrieves A, AAAA, MX, TXT, CNAME records and validates configuration',
  dataSource: {
    name: 'System DNS resolver (via /api/dns)',
    url: '/api/ping',
  },
  run: async (domain: string) => {
    const [a, aaaa, mx, txt, cname] = await Promise.all([
      fetchA(domain),
      fetchAAAA(domain),
      fetchMX(domain),
      fetchTXT(domain),
      fetchCNAME(domain),
    ]);

    const summary = `Found A:${a.length}, AAAA:${aaaa.length}, MX:${mx.length}, TXT:${txt.length}, CNAME:${cname.length}`;

    const issues: string[] = [];
    if (!a.length && !aaaa.length) issues.push('No A/AAAA records found.');
    if (!mx.length) issues.push('No MX records found (email may not be configured).');

    return {
      summary,
      issues,
      data: { a, aaaa, mx, txt, cname },
    };
  },
};
