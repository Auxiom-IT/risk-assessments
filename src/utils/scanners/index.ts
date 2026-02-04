// Framework for composing individual domain scanners for independent execution.
// Each scanner is async and reports its own success/error state; results aggregated.

import i18next from 'i18next';
import {
  DomainScanner,
  ExecutedScannerResult,
  DomainScanAggregate,
  ScannerInterpretation,
} from '../../types/domainScan';

// Import individual scanners
import { dnsScanner, interpretDnsResult } from './dnsScanner';
import { emailAuthScanner, interpretEmailAuthResult } from './emailAuthScanner';
import { certificateScanner, interpretCertificateResult } from './certificateScanner';
import { rdapScanner, interpretRdapResult } from './rdapScanner';
import { securityHeadersScanner, interpretSecurityHeadersResult } from './securityHeadersScanner';

// Default timeout for each scanner (30 seconds). Made mutable for testing.
let DEFAULT_SCANNER_TIMEOUT = 30000;

// Allow runtime override (e.g., tests forcing quick timeout)
export const setScannerTimeout = (ms: number) => {
  if (ms <= 0 || !Number.isFinite(ms)) throw new Error('Invalid timeout value');
  DEFAULT_SCANNER_TIMEOUT = ms;
};

// Utility to run a promise with timeout
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  scannerLabel: string
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        // Translate the scanner label before interpolating into the error message
        const translatedLabel = i18next.t(scannerLabel, { ns: 'scanners' });
        reject(
          new Error(
            i18next.t('common.errors.timeout', {
              ns: 'scanners',
              label: translatedLabel,
              timeout: timeoutMs,
            })
          )
        );
      }, timeoutMs)
    ),
  ]);
};

// Array of all available scanners
export const SCANNERS: DomainScanner[] = [
  dnsScanner,
  emailAuthScanner,
  certificateScanner,
  rdapScanner,
  securityHeadersScanner,
];

// Interpret scanner results to provide user-friendly status and recommendations
export const interpretScannerResult = (scanner: ExecutedScannerResult): ScannerInterpretation => {
  if (scanner.status === 'error') {
    return {
      severity: 'error',
      message: scanner.error || i18next.t('common.errors.scannerFailed', { ns: 'scanners' }),
      recommendation: i18next.t('common.errors.retryMessage', { ns: 'scanners' }),
    };
  }

  const issueCount = scanner.issues?.length || 0;

  // Delegate to scanner-specific interpretation functions
  switch (scanner.id) {
    case 'dns':
      return interpretDnsResult(scanner, issueCount);
    case 'emailAuth':
      return interpretEmailAuthResult(scanner, issueCount);
    case 'certificates':
      return interpretCertificateResult(scanner, issueCount);
    case 'rdap':
      return interpretRdapResult(scanner, issueCount);
    case 'securityHeaders':
      return interpretSecurityHeadersResult(scanner);
    default:
      return {
        severity: issueCount === 0 ? 'success' : 'warning',
        message:
          issueCount === 0
            ? i18next.t('common.interpretation.checkCompleted', { ns: 'scanners' })
            : i18next.t('common.interpretation.issuesFound', { ns: 'scanners', count: issueCount }),
        recommendation:
          issueCount === 0
            ? i18next.t('common.interpretation.noIssuesDetected', { ns: 'scanners' })
            : i18next.t('common.interpretation.reviewIssues', { ns: 'scanners' }),
      };
  }
};

// Execute all scanners in parallel for faster results.
export const runAllScanners = async (
  domain: string,
  onProgress?: (partial: ExecutedScannerResult[]) => void
): Promise<DomainScanAggregate> => {
  const trimmed = domain.trim().toLowerCase();
  const results: ExecutedScannerResult[] = [];

  // Initialize all scanner result objects
  const scannerPromises = SCANNERS.map((scanner) => {
    const start = new Date().toISOString();

    const runPromise = (async (): Promise<ExecutedScannerResult> => {
      try {
        const res = await withTimeout(scanner.run(trimmed), DEFAULT_SCANNER_TIMEOUT, scanner.label);
        const finished = new Date().toISOString();

        const executed: ExecutedScannerResult = {
          id: scanner.id,
          label: scanner.label,
          status: 'complete',
          startedAt: start,
          finishedAt: finished,
          ...res,
        };

        return executed;
      } catch (err) {
        const finished = new Date().toISOString();
        const message = err instanceof Error ? err.message : 'Unknown error';

        const executed: ExecutedScannerResult = {
          id: scanner.id,
          label: scanner.label,
          status: 'error',
          startedAt: start,
          finishedAt: finished,
          error: message,
        };

        return executed;
      }
    })();

    // Update progress as each scanner finishes
    runPromise.then((r) => {
      results.push(r);
      onProgress?.([...results]);
    });

    return runPromise;
  });

  const scanners = await Promise.all(scannerPromises);

  return {
    domain: trimmed,
    scannedAt: new Date().toISOString(),
    scanners,
  };
};

// Run a single scanner by ID.
export const runScanner = async (scannerId: string, domain: string): Promise<ExecutedScannerResult> => {
  const scanner = SCANNERS.find((s) => s.id === scannerId);
  if (!scanner) {
    throw new Error(i18next.t('common.errors.scannerNotFound', { ns: 'scanners', id: scannerId }));
  }

  const start = new Date().toISOString();
  try {
    const res = await withTimeout(scanner.run(domain), DEFAULT_SCANNER_TIMEOUT, scanner.label);
    const finished = new Date().toISOString();

    return {
      id: scanner.id,
      label: scanner.label,
      status: 'complete',
      startedAt: start,
      finishedAt: finished,
      ...res,
    };
  } catch (err) {
    const finished = new Date().toISOString();
    const message = err instanceof Error ? err.message : 'Unknown error';

    return {
      id: scanner.id,
      label: scanner.label,
      status: 'error',
      startedAt: start,
      finishedAt: finished,
      error: message,
    };
  }
};
