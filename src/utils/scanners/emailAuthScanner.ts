import type { DomainScanner } from '../domainscan';
import { fetchTXT } from '../domainChecks';

function stripQuotes(v: string) {
  return v.replace(/^"|"$/g, '');
}

export const emailAuthScanner: DomainScanner = {
  id: 'emailAuth',
  label: 'Email Authentication',
  description: 'Checks SPF, DMARC and DKIM records',
  run: async (domain: string) => {
    const issues: string[] = [];
    const spf = await fetchTXT(domain).catch(() => []);
    const dmarc = await fetchTXT(`_dmarc.${domain}`).catch(() => []);

    const spfVal = spf.map(stripQuotes).find((t) => t.toLowerCase().startsWith('v=spf1'));
    if (!spfVal) issues.push('No SPF record found');

    const dmarcVal = dmarc.map(stripQuotes).find((t) => t.toLowerCase().startsWith('v=dmarc1'));
    if (!dmarcVal) issues.push('No DMARC record found');

    return {
      data: { spf: spfVal ?? null, dmarc: dmarcVal ?? null },
      summary: `SPF:${spfVal ? 'yes' : 'no'}, DMARC:${dmarcVal ? 'yes' : 'no'}`,
      issues,
    };
  },
};

/**
 * Required by src/utils/scanners/index.ts
 * Used for UI severity badge + interpretation messaging.
 */
export const interpretEmailAuthResult = (result: any) => {
  if (result?.issues?.length) {
    return {
      severity: 'warning',
      message: 'Email authentication records found with warnings.',
      recommendation: 'Add or correct SPF and DMARC records to improve email deliverability and spoofing protection.',
    };
  }

  return {
    severity: 'success',
    message: 'Email authentication records retrieved successfully.',
    recommendation: 'SPF and DMARC appear to be configured correctly.',
  };
};
