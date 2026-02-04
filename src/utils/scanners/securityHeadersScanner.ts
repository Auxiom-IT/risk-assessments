// src/utils/scanners/securityHeadersScanner.ts
// Security Headers Scanner: checks for presence of key security headers

import i18next from 'i18next';
import { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';

type SecurityHeadersApiResponse = {
  ok?: boolean;
  testUrl?: string;
  grade?: string | null;
  score?: number | null;
  missingHeaders?: string[];
  warnings?: string[];
  error?: string;
};

export const securityHeadersScanner: DomainScanner = {
  id: 'securityHeaders',
  label: 'securityHeaders.label',
  description: 'securityHeaders.description',
  timeout: 15000,
  dataSource: {
    name: 'securityheaders.com',
    url: 'https://securityheaders.com'
  },
  run: async (domain) => {
    const issues: string[] = [];
    const warningsOut: string[] = [];

    const testUrl = `https://securityheaders.com/?q=${encodeURIComponent(domain)}&hide=on&followRedirects=on`;

    try {
      // ✅ Same-origin API call (no corsproxy)
      const apiUrl = `/api/securityheaders?host=${encodeURIComponent(domain)}`;
      const response = await fetch(apiUrl);

      // If API itself fails (non-2xx), surface it
      if (!response.ok) {
        throw new Error(`Security headers lookup failed (${response.status})`);
      }

      const payload = (await response.json()) as SecurityHeadersApiResponse;

      if (payload?.error) {
        throw new Error(payload.error);
      }

      // Convert missing headers into issues (if any)
      const missing = payload?.missingHeaders ?? [];
      for (const h of missing) {
        issues.push(i18next.t('securityHeaders.issues.missing', { ns: 'scanners', header: h }));
      }

      // Pass through warnings (if any)
      const warns = payload?.warnings ?? [];
      for (const w of warns) warningsOut.push(w);

      const grade = payload?.grade ?? null;
      const score = typeof payload?.score === 'number' ? payload.score : null;

      // Build summary
      let summary = '';
      if (grade) {
        summary = i18next.t('securityHeaders.summary.grade', { ns: 'scanners', grade });
        if (score !== null) {
          summary += i18next.t('securityHeaders.summary.score', { ns: 'scanners', score });
        }
      } else if (score !== null) {
        summary = i18next.t('securityHeaders.summary.grade', {
          ns: 'scanners',
          grade: `${score}/100`
        });
      } else {
        // This is the case you were seeing as "Grade unavailable"
        summary = i18next.t('securityHeaders.summary.analyzed', { ns: 'scanners' });
      }

      const data = {
        status: 'available',
        grade,
        score,
        testUrl: payload?.testUrl ?? testUrl,
        missingHeaders: missing,
        presentHeaders: [] as string[]
      };

      const allIssues = [...issues, ...warningsOut];

      return {
        data,
        summary,
        issues: allIssues.length > 0 ? allIssues : undefined
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      return {
        data: {
          status: 'unavailable',
          error: errorMessage,
          testUrl
        },
        summary: i18next.t('securityHeaders.summary.unavailable', { ns: 'scanners' }),
        issues: [i18next.t('securityHeaders.issues.unavailable', { ns: 'scanners', error: errorMessage })]
      };
    }
  }
};

// Interpretation function for Security Headers scanner results
export const interpretSecurityHeadersResult = (scanner: ExecutedScannerResult): ScannerInterpretation => {
  const data = scanner.data as { status?: string; grade?: string | null; score?: number | null; testUrl?: string };

  if (data?.status === 'unavailable') {
    return {
      severity: 'info',
      message: i18next.t('securityHeaders.interpretation.unavailable.message', { ns: 'scanners' }),
      recommendation: i18next.t('securityHeaders.interpretation.unavailable.recommendation', { ns: 'scanners' })
    };
  }

  // ✅ If grade is missing, treat it as "info" instead of escalating.
  // This prevents the confusing "Grade unavailable" state from feeling like a failure.
  const grade = data?.grade ?? null;
  if (!grade) {
    return {
      severity: 'info',
      message: i18next.t('securityHeaders.interpretation.unavailable.message', { ns: 'scanners' }),
      recommendation: i18next.t('securityHeaders.interpretation.unavailable.recommendation', { ns: 'scanners' })
    };
  }

  let severity: 'success' | 'info' | 'warning' | 'critical';
  let message: string;
  let recommendation: string;

  if (['A+', 'A'].includes(grade)) {
    severity = 'success';
    message = i18next.t('securityHeaders.interpretation.gradeA.message', { ns: 'scanners' });
    recommendation = i18next.t('securityHeaders.interpretation.gradeA.recommendation', { ns: 'scanners' });
  } else if (grade === 'B') {
    severity = 'info';
    message = i18next.t('securityHeaders.interpretation.gradeB.message', { ns: 'scanners' });
    recommendation = i18next.t('securityHeaders.interpretation.gradeB.recommendation', { ns: 'scanners' });
  } else if (grade === 'C') {
    severity = 'warning';
    message = i18next.t('securityHeaders.interpretation.gradeC.message', { ns: 'scanners' });
    recommendation = i18next.t('securityHeaders.interpretation.gradeC.recommendation', { ns: 'scanners' });
  } else {
    severity = 'critical';
    message = i18next.t('securityHeaders.interpretation.gradeDF.message', { ns: 'scanners' });
    recommendation = i18next.t('securityHeaders.interpretation.gradeDF.recommendation', { ns: 'scanners' });
  }

  return { severity, message, recommendation };
};
