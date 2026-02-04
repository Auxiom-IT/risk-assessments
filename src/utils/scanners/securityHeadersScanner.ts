// src/utils/scanners/securityHeadersScanner.ts
import i18next from 'i18next';
import type { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';

type SecurityHeadersApiResponse = {
  host: string;
  grade: string | null;
  score: number | null;
  reportUrl: string;
};

async function fetchSecurityHeaders(domain: string): Promise<SecurityHeadersApiResponse> {
  const res = await fetch(`/api/securityHeaders?host=${encodeURIComponent(domain)}`);
  if (!res.ok) {
    throw new Error(i18next.t('securityHeaders.errors.unavailable', { ns: 'scanners', defaultValue: 'Security headers check unavailable.' }));
  }
  return res.json();
}

export const securityHeadersScanner: DomainScanner = {
  id: 'securityHeaders',
  label: 'securityHeaders.label',
  description: 'securityHeaders.description',

  async run(domain: string) {
    const data = await fetchSecurityHeaders(domain);

    const issues: string[] = [];
    if (!data.grade) {
      issues.push(i18next.t('securityHeaders.issues.noGrade', { ns: 'scanners', defaultValue: 'Unable to determine a security headers grade.' }));
    } else if (['D', 'E', 'F'].includes(data.grade.toUpperCase())) {
      issues.push(
        i18next.t('securityHeaders.issues.poorGrade', {
          ns: 'scanners',
          grade: data.grade,
          defaultValue: `Security headers grade is low (${data.grade}).`,
        })
      );
    }

    return {
      summary:
        data.grade
          ? i18next.t('securityHeaders.summary', {
              ns: 'scanners',
              grade: data.grade,
              score: data.score ?? '—',
              defaultValue: `Grade: ${data.grade} (Score: ${data.score ?? '—'})`,
            })
          : i18next.t('securityHeaders.summaryUnknown', { ns: 'scanners', defaultValue: 'Grade unavailable' }),
      issues,
      data,
      dataSource: {
        name: 'securityheaders.com',
        url: data.reportUrl,
      },
    };
  },
};

export function interpretSecurityHeadersResult(scanner: ExecutedScannerResult): ScannerInterpretation {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('common.errors.scannerFailed', { ns: 'scanners' }),
      recommendation: i18next.t('common.errors.retryMessage', { ns: 'scanners' }),
    };
  }

  const grade = (scanner.data as any)?.grade?.toUpperCase?.() ?? null;

  if (!grade) {
    return {
      severity: 'info',
      message: i18next.t('securityHeaders.interpretation.unknown', { ns: 'scanners', defaultValue: 'Security headers grade could not be determined.' }),
      recommendation: i18next.t('securityHeaders.interpretation.retry', { ns: 'scanners', defaultValue: 'Try again later or open the full report.' }),
    };
  }

  if (['A+', 'A', 'A-'].includes(grade)) {
    return {
      severity: 'success',
      message: i18next.t('securityHeaders.interpretation.good', { ns: 'scanners', grade, defaultValue: `Strong security headers (${grade}).` }),
      recommendation: i18next.t('securityHeaders.interpretation.keep', { ns: 'scanners', defaultValue: 'Keep current configuration.' }),
    };
  }

  if (['B', 'C'].includes(grade)) {
    return {
      severity: 'warning',
      message: i18next.t('securityHeaders.interpretation.ok', { ns: 'scanners', grade, defaultValue: `Security headers could be improved (${grade}).` }),
      recommendation: i18next.t('securityHeaders.interpretation.improve', { ns: 'scanners', defaultValue: 'Review missing headers and tighten policy.' }),
    };
  }

  return {
    severity: 'critical',
    message: i18next.t('securityHeaders.interpretation.bad', { ns: 'scanners', grade, defaultValue: `Weak security headers (${grade}).` }),
    recommendation: i18next.t('securityHeaders.interpretation.fix', { ns: 'scanners', defaultValue: 'Add recommended headers and validate again.' }),
  };
}
