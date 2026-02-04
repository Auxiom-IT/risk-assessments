// src/utils/scanners/emailAuthScanner.ts
import i18next from 'i18next';
import type { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';
import { fetchTXT } from '../domainChecks';
import { getDkimSelectors } from '../dkimSelectorsService';

function stripQuotes(v: string) {
  return v.replace(/^"+|"+$/g, '');
}

function flattenTxt(txt: string[] | undefined): string {
  return (txt ?? []).map(stripQuotes).join('');
}

function hasSpfRecord(txtRecords: string[]): boolean {
  return txtRecords.some((t) => stripQuotes(t).toLowerCase().includes('v=spf1'));
}

function hasDmarcRecord(txtRecords: string[]): boolean {
  return txtRecords.some((t) => stripQuotes(t).toLowerCase().includes('v=dmarc1'));
}

function hasDkimRecord(txtRecords: string[]): boolean {
  return txtRecords.some((t) => stripQuotes(t).toLowerCase().includes('v=dkim1'));
}

async function safeFetchTxt(name: string): Promise<string[]> {
  try {
    const out = await fetchTXT(name);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

export const emailAuthScanner: DomainScanner = {
  id: 'emailAuth',
  label: 'emailAuth.label',
  description: 'emailAuth.description',

  async run(domain: string) {
    const issues: string[] = [];

    // SPF (root TXT)
    const rootTxt = await safeFetchTxt(domain);
    const spfOk = hasSpfRecord(rootTxt);
    if (!spfOk) issues.push(i18next.t('emailAuth.issues.noSPF', { ns: 'scanners' }));

    // DMARC (_dmarc TXT)
    const dmarcTxt = await safeFetchTxt(`_dmarc.${domain}`);
    const dmarcOk = hasDmarcRecord(dmarcTxt);
    if (!dmarcOk) issues.push(i18next.t('emailAuth.issues.noDMARC', { ns: 'scanners' }));

    // DKIM (selector._domainkey TXT)
    const savedSelectors = getDkimSelectors(domain);
    const selectors =
      savedSelectors.length > 0
        ? savedSelectors
        : ['default', 'selector1', 'selector2', 's1', 's2'];

    let dkimFound = false;

    for (const sel of selectors) {
      const name = `${sel}._domainkey.${domain}`;
      const dkimTxt = await safeFetchTxt(name);
      if (dkimTxt.length && hasDkimRecord(dkimTxt)) {
        dkimFound = true;
        break;
      }
    }

    if (!dkimFound) {
      issues.push(i18next.t('emailAuth.issues.noDKIM', { ns: 'scanners' }));
    }

    const summaryParts = [
      `SPF:${spfOk ? 'yes' : 'no'}`,
      `DMARC:${dmarcOk ? 'yes' : 'no'}`,
      `DKIM:${dkimFound ? 'yes' : 'no'}`,
    ];

    return {
      summary: summaryParts.join(', '),
      issues,
      data: {
        spf: flattenTxt(rootTxt),
        dmarc: flattenTxt(dmarcTxt),
        dkimSelectorsTried: selectors,
        dkimFound,
      },
    };
  },
};

// Used by utils/scanners/index.ts to provide a consistent interpretation object
export function interpretEmailAuthResult(scanner: ExecutedScannerResult, issueCount: number): ScannerInterpretation {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('common.errors.scannerFailed', { ns: 'scanners' }),
      recommendation: i18next.t('common.errors.retryMessage', { ns: 'scanners' }),
    };
  }

  if (issueCount === 0) {
    return {
      severity: 'success',
      message: i18next.t('emailAuth.interpretation.ok', { ns: 'scanners', defaultValue: 'Email authentication looks good.' }),
      recommendation: i18next.t('emailAuth.interpretation.none', { ns: 'scanners', defaultValue: 'No changes required.' }),
    };
  }

  // If DKIM missing, keep severity at warning (common for orgs that don’t send mail from domain)
  const issues = scanner.issues ?? [];
  const hasCritical = issues.some((i) => i.includes('DMARC') || i.includes('SPF'));

  return {
    severity: hasCritical ? 'warning' : 'info',
    message: i18next.t('emailAuth.interpretation.issues', { ns: 'scanners', count: issueCount }),
    recommendation: i18next.t('emailAuth.interpretation.recommendation', { ns: 'scanners' }),
  };
}
