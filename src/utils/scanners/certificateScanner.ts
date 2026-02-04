import i18next from 'i18next';
import type { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';
import { fetchCertificates } from '../domainChecks';

type AnyCert = any;

function asArray(data: unknown): AnyCert[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const d = data as any;

  // Common shapes:
  // { certificates: [...] }
  // { host, subject, issuer, valid_from, valid_to, ... }  <-- single cert object
  if (Array.isArray(d.certificates)) return d.certificates;

  // If it looks like a single cert object, wrap it
  const looksLikeSingleCert =
    typeof d === 'object' &&
    (d.subject || d.issuer || d.valid_from || d.valid_to || d.not_before || d.not_after || d.common_name);

  return looksLikeSingleCert ? [d] : [];
}

function normalizeStr(v: unknown): string {
  return String(v ?? '').trim();
}

function parseDate(v: unknown): Date | null {
  const s = normalizeStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getValidity(cert: AnyCert): { notBefore: Date | null; notAfter: Date | null } {
  // CT-style
  const nb1 = parseDate(cert.not_before);
  const na1 = parseDate(cert.not_after);

  // TLS-style (your /api/certificates endpoint returns valid_from / valid_to)
  const nb2 = parseDate(cert.valid_from);
  const na2 = parseDate(cert.valid_to);

  return {
    notBefore: nb1 ?? nb2,
    notAfter: na1 ?? na2
  };
}

function isCurrentlyActive(cert: AnyCert, now: Date): boolean {
  const { notBefore, notAfter } = getValidity(cert);
  if (!notBefore || !notAfter) return false;
  return notBefore.getTime() <= now.getTime() && now.getTime() <= notAfter.getTime();
}

function getSubjectCN(cert: AnyCert): string {
  // TLS-style: cert.subject may be an object like { CN: "example.com", ... }
  const subj = cert.subject;
  if (subj && typeof subj === 'object') {
    return normalizeStr(subj.CN ?? subj.cn ?? subj.commonName);
  }

  // CT-style fields
  return normalizeStr(cert.common_name ?? cert.name_value ?? cert.subject_cn ?? cert.subject);
}

function getIssuerCN(cert: AnyCert): string {
  const iss = cert.issuer;
  if (iss && typeof iss === 'object') {
    return normalizeStr(iss.CN ?? iss.cn ?? iss.commonName);
  }

  return normalizeStr(cert.issuer_name ?? cert.issuer_cn ?? cert.issuer);
}

function getAltNames(cert: AnyCert): string[] {
  // TLS-style: "DNS:example.com, DNS:*.example.com"
  const san = normalizeStr(cert.altNames ?? cert.subjectaltname);
  if (san) {
    return san
      .split(',')
      .map((p) => p.trim())
      .map((p) => p.replace(/^DNS:/i, '').trim())
      .filter(Boolean);
  }

  // CT-style: name_value sometimes includes multiple entries separated by newlines
  const nv = normalizeStr(cert.name_value);
  if (nv && nv.includes('\n')) {
    return nv
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function matchesDomain(pattern: string, domain: string): boolean {
  const p = pattern.toLowerCase();
  const d = domain.toLowerCase();

  if (!p) return false;
  if (p === d) return true;

  // wildcard support: *.example.com
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // ".example.com"
    return d.endsWith(suffix) && d.split('.').length >= suffix.split('.').length;
  }

  return false;
}

function certAppliesToDomain(cert: AnyCert, domain: string): boolean {
  const cn = getSubjectCN(cert);
  const alt = getAltNames(cert);

  // Prefer SANs if present
  if (alt.length) return alt.some((a) => matchesDomain(a, domain));
  if (cn) return matchesDomain(cn, domain);

  return false;
}

function isSelfSignedLeaf(cert: AnyCert): boolean {
  // Heuristics:
  // - issuer/subject CN match (TLS leaf self-signed usually does)
  // - OR issuer_name contains "self-signed"
  const issuerStr = (getIssuerCN(cert) || normalizeStr(cert.issuer_name)).toLowerCase();
  const subjectCN = getSubjectCN(cert).toLowerCase();
  const issuerCN = getIssuerCN(cert).toLowerCase();

  if (issuerStr.includes('self-signed')) return true;
  if (subjectCN && issuerCN && subjectCN === issuerCN) return true;

  return false;
}

export const certificateScanner: DomainScanner = {
  id: 'certificates',
  label: 'certificates.label',
  description: 'certificates.description',
  dataSource: {
    name: 'TLS',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#tls'
  },

  run: async (domain: string) => {
    try {
      const data = await fetchCertificates(domain);
      const certs = asArray(data);

      const now = new Date();

      // Only consider certs that actually match the scanned domain (CN/SAN)
      const applicable = certs.filter((c) => certAppliesToDomain(c, domain));

      // “Active” should mean valid right now
      const active = applicable.filter((c) => isCurrentlyActive(c, now));

      // Only flag self-signed if it's (a) for this domain and (b) currently active
      // This avoids:
      // - historical CT artifacts
      // - root CA self-signed certs
      // - unrelated certs in the dataset
      const activeSelfSigned = active.filter((c) => isSelfSignedLeaf(c));

      const issues: string[] = [];
      if (activeSelfSigned.length > 0) {
        issues.push(i18next.t('certificates.issues.selfSignedActive', { ns: 'scanners', count: activeSelfSigned.length }));
      }

      // Keep the existing “found X total, Y active” UI wording, but now it reflects relevant certs only
      const summary =
        applicable.length > 0
          ? i18next.t('certificates.summary.found', {
              ns: 'scanners',
              total: applicable.length,
              active: active.length
            })
          : i18next.t('certificates.summary.noneFound', { ns: 'scanners' });

      return {
        summary,
        issues,
        data: {
          certificates: applicable,
          totalFound: applicable.length,
          currentlyActive: active.length
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        summary: i18next.t('certificates.summary.error', { ns: 'scanners' }),
        issues: [i18next.t('certificates.issues.lookupFailed', { ns: 'scanners' })],
        data: { error: msg }
      };
    }
  }
};

// Interpretation stays compatible with your existing index.ts usage
export function interpretCertificateResult(scanner: ExecutedScannerResult, issueCount: number): ScannerInterpretation {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('certificates.interpretation.error', { ns: 'scanners' }),
      recommendation: i18next.t('certificates.interpretation.retry', { ns: 'scanners' })
    };
  }

  if (issueCount === 0) {
    return {
      severity: 'success',
      message: i18next.t('certificates.interpretation.ok', { ns: 'scanners' }),
      recommendation: i18next.t('certificates.interpretation.okRecommendation', { ns: 'scanners' })
    };
  }

  return {
    severity: 'warning',
    message: i18next.t('certificates.interpretation.issuesFound', { ns: 'scanners', count: issueCount }),
    recommendation: i18next.t('certificates.interpretation.review', { ns: 'scanners' })
  };
}
