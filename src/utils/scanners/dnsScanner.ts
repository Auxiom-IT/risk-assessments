// DNS Scanner: collects common record types and validates configuration.

import i18next from 'i18next';
import { DomainScanner, ExecutedScannerResult, ScannerInterpretation } from '../../types/domainScan';
import { fetchDNS } from '../domainChecks';

export const dnsScanner: DomainScanner = {
  id: 'dns',
  label: 'dns.label',
  description: 'dns.description',
  timeout: 5000, // 5 seconds - DNS should be fast
  dataSource: {
    name: 'Google Public DNS',
    url: 'https://dns.google',
  },
  run: async (domain) => {
    const types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME'];
    const records = [] as { type: string; data: string[] }[];
    for (const t of types) {
      const r = await fetchDNS(domain, t);
      if (r) records.push(r);
    }

    // Validate DNS configuration and detect issues
    const issues: string[] = [];
    const aRecords = records.find((r) => r.type === 'A')?.data || [];
    const aaaaRecords = records.find((r) => r.type === 'AAAA')?.data || [];
    const mxRecords = records.find((r) => r.type === 'MX')?.data || [];
    const cnameRecords = records.find((r) => r.type === 'CNAME')?.data || [];
    const txtRecords = records.find((r) => r.type === 'TXT')?.data || [];

    // Critical: No A or AAAA records means the domain won't resolve
    if (aRecords.length === 0 && aaaaRecords.length === 0 && cnameRecords.length === 0) {
      issues.push(i18next.t('dns.issues.noRecords', { ns: 'scanners' }));
    }

    // Check for reserved/private IP addresses in A records
    const reservedIPs = ['127.', '0.0.0.0', '10.', '172.16.', '192.168.', '169.254.'];
    aRecords.forEach((ip) => {
      if (reservedIPs.some((reserved) => ip.startsWith(reserved))) {
        issues.push(i18next.t('dns.issues.reservedIP', { ns: 'scanners', ip }));
      }
    });

    // CNAME conflicts: CNAME cannot coexist with other record types at the same name
    if (cnameRecords.length > 0) {
      if (aRecords.length > 0 || aaaaRecords.length > 0 || mxRecords.length > 0) {
        issues.push(i18next.t('dns.issues.cnameConflict', { ns: 'scanners' }));
      }
      if (cnameRecords.length > 1) {
        issues.push(i18next.t('dns.issues.multipleCNAME', { ns: 'scanners' }));
      }
    }

    // Excessive A records might indicate misconfiguration or compromise
    if (aRecords.length > 10) {
      issues.push(i18next.t('dns.issues.excessiveA', { ns: 'scanners', count: aRecords.length }));
    }

    // No MX records means email won't work for this domain
    if (mxRecords.length === 0) {
      issues.push(i18next.t('dns.issues.noMX', { ns: 'scanners' }));
    }

    // Check for overly long TXT records (SPF/DKIM often have this issue)
    txtRecords.forEach((txt) => {
      if (txt.length > 255) {
        // Note: DNS can split these, but it's a common misconfiguration point
        issues.push(i18next.t('dns.issues.longTXT', { ns: 'scanners' }));
      }
    });

    // Check if MX records point to IP addresses (should be hostnames)
    mxRecords.forEach((mx) => {
      // MX format is "priority hostname" e.g., "10 mail.example.com."
      const parts = mx.split(' ');
      const hostname = parts[1] || parts[0];
      // Simple IP detection (contains only digits and dots)
      if (/^\d+\.\d+\.\d+\.\d+\.?$/.test(hostname)) {
        issues.push(i18next.t('dns.issues.mxIP', { ns: 'scanners', hostname }));
      }
    });

    // Build summary with record counts
    const recordCounts = records.map((r) => `${r.type}:${r.data.length}`).join(', ');
    const summary = records.length > 0
      ? i18next.t('dns.summary.found', { ns: 'scanners', records: recordCounts })
      : i18next.t('dns.summary.none', { ns: 'scanners' });

    return {
      data: { records },
      summary,
      issues,
    };
  }
};

// Interpretation function for DNS scanner results
export const interpretDnsResult = (
  scanner: ExecutedScannerResult,
  issueCount: number
): ScannerInterpretation => {
  if (issueCount === 0) {
    return {
      severity: 'success',
      message: i18next.t('dns.interpretation.success.message', { ns: 'scanners' }),
      recommendation: i18next.t('dns.interpretation.success.recommendation', { ns: 'scanners' })
    };
  } else if (issueCount <= 2) {
    return {
      severity: 'warning',
      message: i18next.t('dns.interpretation.warning.message', { ns: 'scanners' }),
      recommendation: i18next.t('dns.interpretation.warning.recommendation', { ns: 'scanners' })
    };
  } else {
    return {
      severity: 'critical',
      message: i18next.t('dns.interpretation.critical.message', { ns: 'scanners' }),
      recommendation: i18next.t('dns.interpretation.critical.recommendation', { ns: 'scanners' })
    };
  }
};
