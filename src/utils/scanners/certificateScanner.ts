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
  // single cert object
  if (Array.isArray(d.certificates)) return d.certificates;

  const looksLikeSingleCert =
    typeof d === 'object' &&
    (d.subject ||
      d.issuer ||
      d.valid_from ||
      d.valid_to ||
      d.not_before ||
      d.not_after ||
      d.common_name ||
      // camelCase variants
      d.notBefore ||
      d.notAfter ||
      d.commonName ||
      d.issuerName ||
      d.nameValue);

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
  // CT-style snake_case
  const nb1 = parseDate(cert.not_before);
  const na1 = parseDate(cert.not_after);

  // TLS-style other variants
  const nb2 = parseDate(cert.valid_from);
  const na2 = parseDate(cert.valid_to);

  // Our SWA function (camelCase)
  const nb3 = parseDate(cert.notBefore);
  const na3 = parseDate(cert.notAfter);

  return {
    notBefore: nb1 ?? nb2 ?? nb3,
    notAfter: na1 ?? na2 ?? na3,
  };
}

function isCurrentlyActive(cert: AnyCert, now: Date): boolean {
  const { notBefore, notAfter } = getValidity(cert);
  if (!notBefore || !notAfter) return false;
  return notBefore.getTime() <= now.getTime() && now.getTime() <= notAfter.getTime();
}

function getSubjectCN(cert: AnyCert): string {
  // TLS-style object
  const subj = cert.subject;
  if (subj && typeof subj === 'object') {
    return normalizeStr(subj.CN ?? subj.cn ?? subj.commonName);
  }

  // Our SWA function (camelCase)
  const cnCamel = normalizeStr(cert.commonName);
  if (cnCamel) return cnCamel;

  // CT-style snake_case / other
  return normalizeStr(cert.common_name ?? cert.subject_cn ?? cert.subject ?? cert.name_value);
}

function getIssuerCN(cert: AnyCert): string {
  const iss = cert.issuer;
  if (iss && typeof iss === 'object') {
    return normalizeStr(iss.CN ?? iss.cn ?? iss.commonName);
  }

  // Our SWA function (camelCase)
  const issuerCamel = normalizeStr(cert.issuerName);
  if (issuerCamel) return issuerCamel;

  // CT-style snake_case / other
  return normalizeStr(cert.issuer_name ?? cert.issuer_cn ?? cert.issuer);
}

function getAltNames(cert: AnyCert): string[] {
  // TLS-style: "DNS:example.com, DNS:*.example.com"
  const san = normalizeStr(cert.altNames ?? cert.subjectaltname);
  if (san) {
    return san
      .split(',')
      .map((p: string) => p.trim())
      .map((p: string) => p.replace(/^DNS:/i, '').trim())
      .filter(Boolean);
  }

  // Our SWA function: nameValue can be newline-separated SANs from CT
  const nvCamel = normalizeStr(cert.nameValue);
  if (nvCamel) {
    return nvCamel
      .split('\n')
      .map((x: string) => x.trim())
      .filter(Boolean);
  }

  // CT-style: name_value sometimes includes multiple entries separated by newlines
  const nv = normalizeStr(cert.name_value);
  if (nv) {
    return nv
      .split('\n')
      .map((x: string) => x.trim())
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
  // - issuer/subject CN match
  // - OR issuer contains "self-signed"
  const issuerStr = (getIssuerCN(cert) || normalizeStr(cert.issuer_name) || normalizeStr(cert.issuerName)).toLowerCase();
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
  dataSource: { name: 'TLS', url: 'https://certificate.transparency.dev/' },

  run: async (domain: string) => {
    const data = await fetchCertificates(domain);
    const certs = asArray(data);
    const now = new Date();

    const applicable = certs.filter((c) => certAppliesToDomain(c, domain));
    const active = applicable.filter((c) => isCurrentlyActive(c, now));

    // Only active self-signed
    const activeSelfSigned = active.filter((c) => isSelfSignedLeaf(c));

    const issues: string[] = [];

    if (applicable.length === 0) {
      issues.push(i18next.t('certificates.issues.noCerts', { ns: 'scanners' }));
    }

    if (activeSelfSigned.length > 0) {
      issues.push(
        i18next.t('certificates.issues.selfSignedActive', {
          ns: 'scanners',
          count: activeSelfSigned.length,
        })
      );
    }

    // Summary uses your translation fragments (found + optional active/expired)
    const expired = applicable.filter((c) => {
      const { notAfter } = getValidity(c);
      return notAfter ? notAfter.getTime() < now.getTime() : false;
    });

    const summary =
      applicable.length > 0
        ? `${i18next.t('certificates.summary.found', { ns: 'scanners', total: applicable.length })}` +
          `${active.length ? i18next.t('certificates.summary.active', { ns: 'scanners', active: active.length }) : ''}` +
          `${expired.length ? i18next.t('certificates.summary.expired', { ns: 'scanners', expired: expired.length }) : ''}`
        : i18next.t('certificates.summary.noneFound', { ns: 'scanners' });

    return {
      summary,
      issues,
      data: {
        certificates: applicable,
        totalFound: applicable.length,
        currentlyActive: active.length,
        expired: expired.length,
      },
    };
  },
};

export function interpretCertificateResult(
  scanner: ExecutedScannerResult,
  issueCount: number
): ScannerInterpretation {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('common.errors.scannerFailed', { ns: 'scanners' }),
      recommendation: i18next.t('common.errors.retryMessage', { ns: 'scanners' }),
    };
  }

  const dataObj = scanner.data && typeof scanner.data === 'object' && scanner.data !== null ? (scanner.data as any) : {};
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
    message: i18next.t('certificates.interpretation.validCerts.message', { ns: 'scanners', count: activeCount }),
    recommendation: i18next.t(
      many
        ? 'certificates.interpretation.validCerts.recommendationMany'
        : 'certificates.interpretation.validCerts.recommendationNormal',
      { ns: 'scanners' }
    ),
  };
}
