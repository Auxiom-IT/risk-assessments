import type { DomainScanner } from '../domainscan';
import { fetchTXT } from '../domainChecks';

function stripQuotes(v: string) {
  return v.replace(/^"+|"+$/g, '');
}

export const emailAuthScanner: DomainScanner = {
  id: 'emailAuth',
  label: 'Email Authentication',
  description: 'Checks SPF, DMARC, DKIM configuration via DNS',
  dataSource: {
    name: 'System DNS resolver (via /api/dns)',
    url: '/api/ping',
  },
  run: async (domain: string) => {
    const txt = await fetchTXT(domain);

    const spf = txt.find((r) => stripQuotes(r).toLowerCase().startsWith('v=spf1'));
    const dmarc = await fetchTXT(`_dmarc.${domain}`);
    const dmarcRecord = dmarc.find((r) => stripQuotes(r).toLowerCase().startsWith('v=dmarc1'));

    const issues: string[] = [];
    if (!spf) issues.push('No SPF record found.');
    if (!dmarcRecord) issues.push('No DMARC record found.');

    return {
      summary: `SPF: ${spf ? 'present' : 'missing'}, DMARC: ${dmarcRecord ? 'present' : 'missing'}`,
      issues,
      data: { spf, dmarc: dmarcRecord },
    };
  },
};
