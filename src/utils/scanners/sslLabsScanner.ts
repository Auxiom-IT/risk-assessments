// SSL Labs scanner: TLS/SSL configuration analysis using SSLLabs API
// Note: This scanner uses polling since SSL Labs processes scans asynchronously

import i18next from 'i18next';
import { DomainScanner, ExecutedScannerResult, ScannerInterpretation, SeverityLevel } from '../../types/domainScan';

export const sslLabsScanner: DomainScanner = {
  id: 'sslLabs',
  label: 'sslLabs.label',
  description: 'sslLabs.description',
  timeout: 600000, // 10 minutes - SSL Labs can take a while with polling
  dataSource: {
    name: 'Qualys SSL Labs',
    url: 'https://www.ssllabs.com/ssltest/',
  },
  run: async (domain) => {
    const warnings: string[] = [];
    const issues: string[] = [];

    // Type definitions for SSL Labs API responses
    interface SSLLabsProtocol {
      name: string;
      version: string;
    }

    interface SSLLabsCertChain {
      issues?: number;
    }

    interface SSLLabsEndpointDetails {
      protocols?: SSLLabsProtocol[];
      vulnBeast?: boolean;
      poodle?: boolean;
      heartbleed?: boolean;
      freak?: boolean;
      logjam?: boolean;
      drownVulnerable?: boolean;
      certChains?: SSLLabsCertChain[];
      forwardSecrecy?: number;
      hstsPolicy?: {
        status: string;
        maxAge?: number;
      };
    }

    interface SSLLabsEndpoint {
      ipAddress: string;
      grade?: string;
      statusMessage?: string;
      hasWarnings?: boolean;
      isExceptional?: boolean;
      details?: SSLLabsEndpointDetails;
    }

    interface SSLLabsResult {
      status: string;
      statusMessage?: string;
      endpoints?: SSLLabsEndpoint[];
    }

    // Helper function to fetch analysis status
    const fetchAnalysis = async (fromCache: boolean = true, startNew: boolean = false) => {
      // Build the SSL Labs API URL
      const sslLabsUrl = new URL('https://api.ssllabs.com/api/v3/analyze');
      sslLabsUrl.searchParams.append('host', domain);
      sslLabsUrl.searchParams.append('fromCache', fromCache ? 'on' : 'off');
      sslLabsUrl.searchParams.append('all', 'done');
      if (startNew) {
        sslLabsUrl.searchParams.append('startNew', 'on');
      }

      // Build the CORS proxy URL with key first, then url parameter
      // We use corsproxy.io to proxy requests that we can't make directly from the browser. Normally, we would not use
      // a commercial proxy service for production code. However, since all of these data are publicly available, we are
      // using this service for convenience in this open source project. If you are forking this code for your own use,
      // consider hosting your own CORS proxy or making server-side requests instead.
      const proxyUrl = new URL('https://corsproxy.io/');
      // TODO: Currently, the API documentation for CORS Proxy says a key is required from a non-localhost domain.
      // However, when the key is provided, their API returns a 403 error with a bad URL, which suggests they are
      // parsing the querystring incorrectly. For now, we will omit the key to allow things to work, but we expect that
      // the API will be fixed in the future and this key will be required again.
      // proxyUrl.searchParams.set('key', '54aed9d2');
      proxyUrl.searchParams.set('url', sslLabsUrl.toString());

      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`SSL Labs API returned ${response.status}: ${response.statusText}`);
      }

      return await response.json() as SSLLabsResult;
    };

    try {
      // First, try to get cached results
      let result: SSLLabsResult = await fetchAnalysis(true, false);

      // If no cached results or scan in progress, we may need to poll
      const maxPolls = 20; // Maximum 20 polls (10 minutes at 30 second intervals)
      const pollInterval = 30000; // 30 seconds
      let pollCount = 0;

      while (result.status !== 'READY' && result.status !== 'ERROR' && pollCount < maxPolls) {
        // If status is DNS, IN_PROGRESS, wait and poll again
        if (result.status === 'DNS' || result.status === 'IN_PROGRESS') {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          result = await fetchAnalysis(true, false);
          pollCount++;
        } else {
          // For other statuses, break
          break;
        }
      }

      // Handle different result statuses
      if (result.status === 'ERROR') {
        return {
          data: { status: result.status, statusMessage: result.statusMessage },
          summary: i18next.t(
            'sslLabs.summary.error',
            { ns: 'scanners', error: result.statusMessage || 'Unknown error' }
          ),
          issues: [i18next.t(
            'sslLabs.issues.scanError',
            { ns: 'scanners', error: result.statusMessage || 'Unknown error' }
          )]
        };
      }

      if (result.status !== 'READY') {
        return {
          data: { status: result.status },
          summary: i18next.t('sslLabs.summary.inProgress', { ns: 'scanners', status: result.status }),
          issues: [i18next.t('sslLabs.issues.timeout', { ns: 'scanners' })]
        };
      }

      // Process READY results
      const endpoints = result.endpoints || [];

      if (endpoints.length === 0) {
        return {
          data: { status: result.status, endpoints: [] },
          summary: i18next.t('sslLabs.summary.noEndpoints', { ns: 'scanners' }),
          issues: [i18next.t('sslLabs.issues.noEndpoints', { ns: 'scanners' })]
        };
      }

      // Analyze each endpoint
      const grades: string[] = [];
      let lowestGradeValue = 100;
      const gradeMap: Record<string, number> = {
        'A+': 100, 'A': 95, 'A-': 90, 'B': 80, 'C': 70, 'D': 60, 'E': 50, 'F': 40, 'T': 30, 'M': 20
      };

      endpoints.forEach((endpoint: SSLLabsEndpoint) => {
        if (endpoint.grade) {
          grades.push(endpoint.grade);
          const gradeValue = gradeMap[endpoint.grade] || 0;
          lowestGradeValue = Math.min(lowestGradeValue, gradeValue);
        }

        // Check for specific issues
        if (endpoint.statusMessage && endpoint.statusMessage !== 'Ready') {
          warnings.push(`Endpoint ${endpoint.ipAddress}: ${endpoint.statusMessage}`);
        }

        // Analyze protocol support
        if (endpoint.details) {
          const details = endpoint.details;

          // Check for outdated protocols
          if (details.protocols) {
            const hasSSLv2 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'SSL' && p.version === '2.0');
            const hasSSLv3 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'SSL' && p.version === '3.0');
            const hasTLS10 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'TLS' && p.version === '1.0');
            const hasTLS11 = details.protocols.some((p: SSLLabsProtocol) =>
              p.name === 'TLS' && p.version === '1.1');

            if (hasSSLv2 || hasSSLv3) {
              const protocols = [];
              if (hasSSLv2) protocols.push('SSLv2');
              if (hasSSLv3) protocols.push('SSLv3');
              issues.push(i18next.t(
                'sslLabs.issues.weakProtocols',
                { ns: 'scanners', protocols: protocols.join(', ') }
              ));
            }
            if (hasTLS10 || hasTLS11) {
              const protocols = [];
              if (hasTLS10) protocols.push('TLS 1.0');
              if (hasTLS11) protocols.push('TLS 1.1');
              warnings.push(i18next.t(
                'sslLabs.issues.weakProtocols',
                { ns: 'scanners', protocols: protocols.join(', ') }
              ));
            }
          }

          // Check for vulnerabilities
          const vulnerabilities = [];
          if (details.vulnBeast) vulnerabilities.push('BEAST');
          if (details.poodle) vulnerabilities.push('POODLE');
          if (details.heartbleed) vulnerabilities.push('Heartbleed');
          if (details.freak) vulnerabilities.push('FREAK');
          if (details.logjam) vulnerabilities.push('Logjam');
          if (details.drownVulnerable) vulnerabilities.push('DROWN');

          if (vulnerabilities.length > 0) {
            issues.push(i18next.t(
              'sslLabs.issues.vulnerable',
              { ns: 'scanners', vulnerabilities: vulnerabilities.join(', ') }
            ));
          }

          // Check certificate issues
          if (details.certChains) {
            const hasCertIssues = details.certChains.some((c: SSLLabsCertChain) => c.issues && (c.issues & 1));
            if (hasCertIssues) {
              warnings.push(i18next.t(
                'sslLabs.issues.certIssues',
                { ns: 'scanners' }
              ));
            }
          }

          // Check for forward secrecy
          if (details.forwardSecrecy === 0) {
            warnings.push(i18next.t('sslLabs.issues.noPFS', { ns: 'scanners' }));
          }

          // Check for HSTS
          if (!details.hstsPolicy || details.hstsPolicy.status === 'absent') {
            warnings.push(i18next.t('sslLabs.issues.noHSTS', { ns: 'scanners' }));
          } else if (details.hstsPolicy.status === 'present' &&
                     details.hstsPolicy.maxAge &&
                     details.hstsPolicy.maxAge < 15768000) {
            warnings.push(i18next.t('sslLabs.issues.hstsShort', { ns: 'scanners', maxAge: details.hstsPolicy.maxAge }));
          }
        }
      });

      // Build summary
      const uniqueGrades = [...new Set(grades)].sort((a, b) => a.localeCompare(b));
      const gradeText = uniqueGrades.length > 0 ? uniqueGrades.join(', ') : 'No grade';
      const allIssues = [...issues, ...warnings];

      const summary = uniqueGrades.length > 0
        ? i18next.t('sslLabs.summary.grade', { ns: 'scanners', grade: gradeText })
        : i18next.t('sslLabs.summary.noEndpoints', { ns: 'scanners' });

      // Add data for UI
      const data = {
        status: result.status,
        endpoints: endpoints.map((ep: SSLLabsEndpoint) => ({
          ipAddress: ep.ipAddress,
          grade: ep.grade,
          hasWarnings: ep.hasWarnings,
          isExceptional: ep.isExceptional,
        })),
        grades: uniqueGrades,
        lowestGrade: uniqueGrades[uniqueGrades.length - 1] || null,
        testUrl: `https://www.ssllabs.com/ssltest/analyze.html?d=${encodeURIComponent(domain)}`,
      };

      return {
        data,
        summary,
        issues: allIssues
      };

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        data: { error: errorMessage },
        summary: 'SSL Labs scan failed',
        issues: [`Failed to scan SSL/TLS configuration: ${errorMessage}`]
      };
    }
  }
};

// Interpretation function for SSL Labs scanner results
export const interpretSslLabsResult = (scanner: ExecutedScannerResult): ScannerInterpretation => {
  const data = scanner.data as {
    status?: string;
    grades?: string[];
    lowestGrade?: string;
    endpoints?: unknown[];
    testUrl?: string;
    error?: string;
  };

  if (data?.status === 'ERROR') {
    return {
      severity: 'error',
      message: i18next.t('sslLabs.interpretation.error.message', { ns: 'scanners' }),
      recommendation: i18next.t('sslLabs.interpretation.error.recommendation', { ns: 'scanners' })
    };
  }

  if (data?.status !== 'READY') {
    return {
      severity: 'info',
      message: i18next.t('sslLabs.interpretation.error.message', { ns: 'scanners' }),
      recommendation: i18next.t('sslLabs.interpretation.error.recommendation', { ns: 'scanners' })
    };
  }

  const lowestGrade = data?.lowestGrade;
  let severity: SeverityLevel;
  let message: string;
  let recommendation: string;

  if (lowestGrade && ['A+', 'A', 'A-'].includes(lowestGrade)) {
    severity = 'success';
    message = i18next.t('sslLabs.interpretation.gradeA.message', { ns: 'scanners' });
    recommendation = i18next.t('sslLabs.interpretation.gradeA.recommendation', { ns: 'scanners' });
  } else if (lowestGrade && ['B'].includes(lowestGrade)) {
    severity = 'warning';
    message = i18next.t('sslLabs.interpretation.gradeB.message', { ns: 'scanners' });
    recommendation = i18next.t('sslLabs.interpretation.gradeB.recommendation', { ns: 'scanners' });
  } else if (lowestGrade && ['C'].includes(lowestGrade)) {
    severity = 'warning';
    message = i18next.t('sslLabs.interpretation.gradeC.message', { ns: 'scanners' });
    recommendation = i18next.t('sslLabs.interpretation.gradeC.recommendation', { ns: 'scanners' });
  } else {
    severity = 'critical';
    message = i18next.t('sslLabs.interpretation.gradeDF.message', { ns: 'scanners' });
    recommendation = i18next.t('sslLabs.interpretation.gradeDF.recommendation', { ns: 'scanners' });
  }

  return {
    severity,
    message,
    recommendation
  };
};
