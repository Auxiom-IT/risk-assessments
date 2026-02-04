import { generateWordHTML, exportToWord } from './exportReport';
import type { ScoreResult } from './scoring';
import type { DomainScanAggregate } from '../types/domainScan';

// Mock translation function
const mockT = (key: string): string => {
  const translations: Record<string, string> = {
    'report.scoreExcellent': 'Excellent Security Posture',
    'report.scoreGood': 'Good Security Posture',
    'report.scoreFair': 'Fair - Improvements Needed',
    'report.scorePoor': 'Critical - Immediate Action Required',
    'report.wordExport.title': 'Security Risk Assessment Report',
    'report.wordExport.overallSecurityScore': 'Overall Security Score',
    'report.wordExport.categoryAnalysisTitle': 'Category Analysis',
    'report.wordExport.categoriesEvaluated': 'security categories evaluated',
    'report.wordExport.average': 'Average:',
    'report.wordExport.score': 'Score:',
    'report.wordExport.moduleScannerResults': 'Modular Scanner Results',
    'report.wordExport.executed': 'Executed',
    'report.wordExport.scannersAt': 'scanners at',
    'report.wordExport.summary': 'Summary:',
    'report.wordExport.aggregatedIssues': 'Aggregated Issues',
    'report.wordExport.noAggregatedIssues': 'No aggregated issues detected.',
    'report.wordExport.fullHeaderAnalysisLabel': 'Full header analysis:',
    'report.identifiedRisks': 'Identified Risks',
    'report.noRisksYet': 'No risks yet. Complete questionnaire or run domain scan.',
    'report.bestPracticesConfirmed': 'Best Practices Confirmed',
    'report.noBestPracticesYet': 'No best practices confirmed yet.',
    'report.limitations': 'Limitations',
    // eslint-disable-next-line max-len
    'report.limitationsText':
      'This static tool performs only client-side checks using public unauthenticated sources. Some deeper assessments (full SSL chain validation, comprehensive breach analysis, exhaustive security header audit, port exposure) require server-side or authenticated APIs.',
  };
  return translations[key] || key;
};

// Mock scanners translation function
const mockTScanners = (key: string): string => {
  const translations: Record<string, string> = {
    'dns.label': 'DNS Records',
    'emailAuth.label': 'Email Authentication',
    'certificates.label': 'SSL/TLS Certificates',
    'rdap.label': 'Domain Registration (RDAP)',
    'securityHeaders.label': 'Security Headers',
    'common.errors.timeout': '{{label}} timed out after {{timeout}}ms',
    'common.errors.scannerFailed': 'Scanner failed to execute',
    // eslint-disable-next-line max-len
    'common.errors.retryMessage':
      'This check could not be completed. Please try again or check your network connection.',
  };
  // Simple interpolation for testing
  let result = translations[key] || key;
  if (key === 'common.errors.timeout') {
    result = result.replace('{{label}}', 'Test Scanner').replace('{{timeout}}', '30000');
  }
  return result;
};

// Mock getComputedStyle
const mockGetComputedStyle = vi.fn(() => ({
  getPropertyValue: vi.fn((prop: string) => {
    const colorMap: Record<string, string> = {
      '--green': '#18BB9C',
      '--blue': '#44C8F5',
      '--yellow': '#F39C11',
      '--red': '#E84C3D',
      '--text-primary': '#231F20',
      '--text-secondary': '#06233F',
      '--accent': '#44C8F5',
      '--panel-bg': '#FFFFFF',
      '--page-bg': '#F5F5F5',
    };
    return colorMap[prop] || '';
  }),
}));

global.getComputedStyle = mockGetComputedStyle as unknown as typeof getComputedStyle;

describe('exportReport', () => {
  const sampleScore: ScoreResult = {
    total: 75,
    max: 100,
    percent: 75,
    categories: [
      { category: 'Access Management', total: 15, max: 20, percent: 75 },
      { category: 'Network Security', total: 30, max: 40, percent: 75 },
      { category: 'Data Protection', total: 30, max: 40, percent: 75 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateWordHTML', () => {
    it('generates HTML with score section', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Security Risk Assessment Report');
      expect(html).toContain('Overall Security Score');
      expect(html).toContain('75%');
      expect(html).toContain('Good Security Posture');
    });

    it('includes all categories with their scores', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('Access Management');
      expect(html).toContain('Network Security');
      expect(html).toContain('Data Protection');
    });

    it('handles empty risks and best practices', () => {
      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(html).toContain('No risks yet');
      expect(html).toContain('No best practices confirmed yet');
    });

    it('includes scanner results when present', () => {
      const scan: DomainScanAggregate = {
        domain: 'example.com',
        scannedAt: new Date().toISOString(),
        scanners: [
          {
            id: 'dns',
            label: 'dns.label',
            status: 'complete',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            summary: 'DNS ok',
            issues: [],
            data: {},
          },
        ],
      };

      const html = generateWordHTML({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
        domainScanAggregate: scan,
      });

      expect(html).toContain('Modular Scanner Results');
      expect(html).toContain('DNS Records');
      expect(html).toContain('DNS ok');
    });
  });

  describe('exportToWord', () => {
    it('creates and downloads a .doc file', async () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      const clickMock = vi.fn();

      createElementSpy.mockReturnValue({
        href: '',
        download: '',
        click: clickMock,
      } as unknown as HTMLAnchorElement);

      const blobSpy = vi.spyOn(global, 'Blob');

      await exportToWord({
        score: sampleScore,
        risks: [],
        bestPractices: [],
        t: mockT,
        tScanners: mockTScanners,
      });

      expect(blobSpy).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickMock).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
    });
  });
});
