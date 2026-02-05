import i18next from 'i18next';
import type { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';
import { fetchCertificates } from '../domainChecks';

type AnyCert = {
  subject?: { commonName?: string };
  issuer?: { commonName?: string };
  notAfter?: string; // ISO date string
  dnsNames?: string[];
  isSelfSigned?: boolean;
  isWildcard?: boolean;
  isExpired?: boolean;
  isActive?: boolean;
};

// Helper: days until expiry
const daysUntil = (isoDate?: string): number | null => {
  if (!isoDate) return null;
  const d = new Date(isoDate).getTime();
  if (!Number.isFinite(d)) return null;
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
};

// Strict-ish hostname matcher with wildcard support.
// - Exact match: example.com === example.com
// - Subdomain match: www.example.com endsWith .example.com
// - Wildcard: *.example.com matches foo.example.com AND (for our purposes) also matches example.com
const matchesDomain = (pattern: string, domain: string): boolean => {
  const p = (pattern || '').toLowerCase().trim();
  const d = (domain || '').toLowerCase().trim();
  if (!p || !d) return false;

  if (p === d) return true;

  // Wildcard support: *.example.com
  if (p.startsWith('*.')) {
    const apex = p.slice(2); // example.com
    // Treat wildcard certs as relevant for apex scans too
    if (d === apex) return true;
    return d.endsWith(`.${apex}`);
  }

  // Non-wildcard: allow subdomain matches (but not "evilgoogle.com" matching "google.com")
  return d.endsWith(`.${p}`);
};

export const certificateScanner: DomainScanner = {
  id: 'certificates',
  label: 'certificates.label',
  description: 'certificates.description',
  dataSource: { name: 'TLS', url: 'https://certificate.transparency.dev/' },

  run: async (domain: string) => {
    const issues: string[] = [];

    const normalized = domain.trim().toLowerCase();

    // Also consider www.<domain> and apex (in case user scanned www.)
    const targets = Array.from(
      new Set([
        normalized,
        normalized.startsWith('www.') ? normalized.slice(4) : normalized,
        normalized.startsWith('www.') ? normalized : `www.${normalized}`,
      ])
    );

    const appliesToTargets = (name: string) => targets.some((t) => matchesDomain(name, t));

    // NOTE: fetchCertificates should return an array of cert-like objects.
    const certs = (await fetchCertificates(normalized)) as AnyCert[];

    // Keep only certs that look like they belong to this domain (or wildcard for it).
    const applicable = (certs || []).filter((c) => {
      const cn = (c.subject?.commonName || '').toLowerCase();
      const dnsNames = (c.dnsNames || []).map((n) => n.toLowerCase());

      const matchesCN = cn ? appliesToTargets(cn) : false;
      const matchesSAN = dnsNames.some((n) => appliesToTargets(n));

      return matchesCN || matchesSAN;
    });

    const active = applicable.filter((c) => c.isActive);
    const expired = applicable.filter((c) => c.isExpired);

    // ===== Issues detection =====

    // If CT returns nothing applicable, show "noCerts"
    if (applicable.length === 0) {
      issues.push(i18next.t('certificates.issues.noCerts', { ns: 'scanners' }));
    }

    // Self-signed: count only those explicitly marked self-signed AND active.
    const selfSignedActive = applicable.filter((c) => c.isSelfSigned && c.isActive);
    if (selfSignedActive.length > 0) {
      issues.push(
        i18next.t('certificates.issues.selfSigned', {
          ns: 'scanners',
          count: selfSignedActive.length,
        })
      );
    }

    const wildcard = applicable.filter((c) => c.isWildcard);
    if (wildcard.length > 0) {
      issues.push(
        i18next.t('certificates.issues.wildcard', {
          ns: 'scanners',
          count: wildcard.length,
        })
      );
    }

    // Expiration warnings (active certs only)
    const expiring7: { commonName: string; days: number }[] = [];
    const expiring30: { commonName: string; days: number }[] = [];

    for (const c of active) {
      const days = daysUntil(c.notAfter);
      if (days == null) continue;
      const commonName = c.subject?.commonName || domain;

      if (days >= 0 && days <= 7) expiring7.push({ commonName, days });
      else if (days > 7 && days <= 30) expiring30.push({ commonName, days });
    }

    for (const e of expiring7) {
      issues.push(
        i18next.t('certificates.issues.expiring7Days', {
          ns: 'scanners',
          commonName: e.commonName,
          days: e.days,
        })
      );
    }
    for (const e of expiring30) {
      issues.push(
        i18next.t('certificates.issues.expiring30Days', {
          ns: 'scanners',
          commonName: e.commonName,
          days: e.days,
        })
      );
    }

    // Excessive active certs
    if (active.length >= 10) {
      issues.push(
        i18next.t('certificates.issues.excessive', {
          ns: 'scanners',
          count: active.length,
        })
      );
    }

    // Many issuers (basic heuristic)
    const issuers = new Set(
      applicable
        .map((c) => (c.issuer?.commonName || '').trim())
        .filter((x) => x.length > 0)
    );
    if (issuers.size >= 3) {
      issues.push(
        i18next.t('certificates.issues.manyIssuers', {
          ns: 'scanners',
          count: issuers.size,
        })
      );
    }

    // ===== Summary =====
    const summary = applicable.length
      ? `${i18next.t('certificates.summary.found', { ns: 'scanners', total: applicable.length })}` +
        `${active.length ? i18next.t('certificates.summary.active', { ns: 'scanners', active: active.length }) : ''}` +
        `${expired.length ? i18next.t('certificates.summary.expired', { ns: 'scanners', expired: expired.length }) : ''}`
      : i18next.t('certificates.summary.noneFound', { ns: 'scanners' });

    return {
      summary,
      issues,
      data: {
        totalFound: applicable.length,
        currentlyActive: active.length,
        expired: expired.length,
        certificates: applicable,
      },
    };
  },
};

// Interpretation used by utils/scanners/index.ts
export function interpretCertificateResult(scanner: ExecutedScannerResult, issueCount: number): ScannerInterpretation {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('common.errors.scannerFailed', { ns: 'scanners' }),
      recommendation: i18next.t('common.errors.retryMessage', { ns: 'scanners' }),
    };
  }

  const dataObj =
    scanner.data && typeof scanner.data === 'object' && scanner.data !== null ? (scanner.data as any) : {};

  const totalFound = Number.isFinite(Number(dataObj.totalFound)) ? Number(dataObj.totalFound) : undefined;
  const activeCount = Number.isFinite(Number(dataObj.currentlyActive)) ? Number(dataObj.currentlyActive) : 0;

  if (totalFound === 0) {
    return {
      severity: 'info',
      message: i18next.t('certificates.interpretation.noCerts.message', { ns: 'scanners' }),
      recommendation: i18next.t('certificates.interpretation.noCerts.recommendation', { ns: 'scanners' }),
    };
  }

  if (issueCount > 0) {
    return {
      severity: 'warning',
      message: i18next.t('certificates.interpretation.issuesDetected.message', {
        ns: 'scanners',
        activeCertCount: activeCount,
        issueCount,
      }),
      recommendation: i18next.t('certificates.interpretation.issuesDetected.recommendation', { ns: 'scanners' }),
    };
  }

  const many = activeCount >= 10;

  return {
    severity: 'success',
    message: i18next.t('certificates.interpretation.validCerts.message', {
      ns: 'scanners',
      count: activeCount,
    }),
    recommendation: i18next.t(
      many
        ? 'certificates.interpretation.validCerts.recommendationMany'
        : 'certificates.interpretation.validCerts.recommendationNormal',
      { ns: 'scanners' }
    ),
  };
}
