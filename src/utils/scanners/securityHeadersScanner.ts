// Security Headers Scanner: checks for presence of key security headers

import i18next from 'i18next';
import { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';

export const securityHeadersScanner: DomainScanner = {
  id: 'securityHeaders',
  label: 'securityHeaders.label',
  description: 'securityHeaders.description',
  timeout: 15000, // 15 seconds - external service
  dataSource: {
    name: 'securityheaders.com',
    url: 'https://securityheaders.com',
  },
  run: async (domain) => {
    const issues: string[] = [];
    const warnings: string[] = [];

    try {
      // Build the securityheaders.com URL
      const testUrl = `https://securityheaders.com/?q=${encodeURIComponent(domain)}&hide=on&followRedirects=on`;

      // Build the CORS proxy URL
      // We use corsproxy.io to proxy requests that we can't make directly from the browser. Normally, we would not use
      // a commercial proxy service for production code. However, since all of these data are publicly available, we are
      // using this service for convenience in this open source project. If you are forking this code for your own use,
      // consider hosting your own CORS proxy or making server-side requests instead.
      const proxyUrl = new URL('https://corsproxy.io/');
      proxyUrl.searchParams.set('url', testUrl);

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`securityheaders.com returned ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Parse the grade from the HTML
      // The grade appears in a div with class "score" containing a div with class "score_*" and a span
      // Example: <div class="score"><div class="score_yellow"><span>B</span></div></div>
      const gradeMatch = html.match(
        /<div\s+class="score">\s*<div\s+class="score_[^"]*">\s*<span>([A-F][+-]?)<\/span>/i
      );
      const grade = gradeMatch ? gradeMatch[1] : null;

      // Parse the score from the HTML
      // The score appears in the reportTitle div
      // Example: <div class="reportTitle">...Score: 85...</div>
      const scoreMatch = html.match(/Score:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

      // Parse missing headers from the "Missing Headers" section
      // Missing headers appear in a reportSection with reportTitle "Missing Headers"
      // Example: <th class="tableLabel table_red">Permissions-Policy</th>
      const missingHeadersSection = html.match(
        /<div class="reportTitle">Missing Headers<\/div>[\s\S]*?<div class="reportBody">([\s\S]*?)<\/div>\s*<\/div>/i
      );
      const missingHeaders: string[] = [];
      if (missingHeadersSection) {
        const headerMatches = missingHeadersSection[1].matchAll(
          /<th\s+class="tableLabel table_red">([^<]+)<\/th>/gi
        );
        for (const match of headerMatches) {
          const headerName = match[1].trim();
          if (headerName && !missingHeaders.includes(headerName)) {
            missingHeaders.push(headerName);
            issues.push(i18next.t('securityHeaders.issues.missing', { ns: 'scanners', header: headerName }));
          }
        }
      }

      // Parse warnings from the "Warnings" section
      // Warnings appear in a reportSection with reportTitle "Warnings"
      // Example: <th class="tableLabel table_orange">Site is using HTTP</th>
      const warningsSection = html.match(
        /<div class="reportTitle">Warnings<\/div>[\s\S]*?<div class="reportBody">([\s\S]*?)<\/div>\s*<\/div>/i
      );
      if (warningsSection) {
        const warningMatches = warningsSection[1].matchAll(
          /<th\s+class="tableLabel table_orange">([^<]+)<\/th>/gi
        );
        for (const match of warningMatches) {
          const warningText = match[1].trim();
          if (warningText) {
            warnings.push(warningText);
          }
        }
      }

      // Parse present headers (if needed for data)
      // These would be in a different section, similar pattern
      const presentHeaders: string[] = [];
      // Note: We may not need to parse present headers if the grade/score is sufficient

      // Build summary
      let summary = '';
      if (grade) {
        summary = i18next.t('securityHeaders.summary.grade', { ns: 'scanners', grade });
        if (score !== null) {
          summary += i18next.t('securityHeaders.summary.score', { ns: 'scanners', score });
        }
      } else if (score !== null) {
        summary = i18next.t('securityHeaders.summary.grade', { ns: 'scanners', grade: score + '/100' });
      } else {
        summary = i18next.t('securityHeaders.summary.analyzed', { ns: 'scanners' });
      }

      const data = {
        status: 'available',
        grade,
        score,
        testUrl,
        missingHeaders,
        presentHeaders,
      };

      const allIssues = [...issues, ...warnings];

      return {
        data,
        summary,
        issues: allIssues.length > 0 ? allIssues : undefined,
      };

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // If we can't reach the service, provide a fallback
      const testUrl = `https://securityheaders.com/?q=${encodeURIComponent(domain)}&hide=on&followRedirects=on`;

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
  const data = scanner.data as { status?: string; grade?: string; score?: number; testUrl?: string };
  if (data?.status === 'unavailable') {
    return {
      severity: 'info',
      message: i18next.t('securityHeaders.interpretation.unavailable.message', { ns: 'scanners' }),
      recommendation: i18next.t('securityHeaders.interpretation.unavailable.recommendation', { ns: 'scanners' })
    };
  }

  // Grade-based interpretation
  const grade = data?.grade || 'Unknown';
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

  return {
    severity,
    message,
    recommendation
  };
};
