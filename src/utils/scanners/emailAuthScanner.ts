import type { DomainScanner } from '../domainscan';
import { fetchTXT } from '../domainChecks';

function stripQuotes(v: string) {
  return v.replace(/^"+|"+$/g, '').trim();
}

function firstTxtValue(txtRecords: string[] | undefined) {
  if (!txtRecords || txtRecords.length === 0) return null;
  // Some providers return chunks like ["v=spf1 ...", "..."] — we keep it simple:
  // - join if multiple, otherwise use first
  const joined = txtRecords.join('');
  return stripQuotes(joined);
}

export const emailAuthScanner: DomainScanner = {
  id: 'emailAuth',
  label: 'emailAuth.label',
  description: 'emailAuth.description',
  dataSource: {
    name: 'DNS',
    url: 'https://www.iana.org/domains/reserved',
  },
  run: async (domain: string) => {
    try {
      // SPF is stored at the root domain as TXT containing v=spf1
      const txtRoot = await fetchTXT(domain);

      // DMARC is stored at _dmarc.<domain> as TXT containing v=DMARC1
      const txtDmarc = await fetchTXT(`_dmarc.${domain}`);

      const spf = firstTxtValue((txtRoot ?? []).filter((r) => r.includes('v=spf1')));
      const dmarc = firstTxtValue((txtDmarc ?? []).filter((r) => r.includes('v=DMARC1')));

      const issues: string[] = [];

      if (!spf) issues.push('SPF record not found');
      if (!dmarc) issues.push('DMARC record not found');

      // DKIM is more complex (selectors). If your app handles DKIM via a separate
      // selector flow/modal, we avoid doing selector guessing here to preserve behavior.

      return {
        data: {
          spf: !!spf,
          dmarc: !!dmarc,
          spfRecord: spf ?? undefined,
          dmarcRecord: dmarc ?? undefined,
        },
        summary: `SPF:${spf ? 'yes' : 'no'}, DMARC:${dmarc ? 'yes' : 'no'}`,
        issues,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      return {
        summary: 'Email authentication lookup failed',
        issues: [`Error: ${msg}`],
      };
    }
  },
};

// ✅ Exported ONCE (this is the thing your build complained about)
export const interpretEmailAuthResult = (result: any) => {
  if (result?.status === 'error') {
    return {
      severity: 'error',
      message: result?.error || 'Email authentication check failed',
      recommendation: 'Please try again later.',
    };
  }

  const issueCount = Array.isArray(result?.issues) ? result.issues.length : 0;

  if (issueCount === 0) {
    return {
      severity: 'success',
      message: 'Email authentication records look good.',
      recommendation: 'No action needed.',
    };
  }

  // Warnings by default (missing SPF/DMARC typically)
  return {
    severity: 'warning',
    message: 'Email authentication records found with warnings.',
    recommendation: 'Add or correct SPF/DMARC records to improve deliverability and spoofing protection.',
  };
};
