import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../../context/AppStateContext';
import { SCANNERS, interpretScannerResult } from '../../utils/scanners';
import { TrackedButton } from '../TrackedButton';
import { trackFormSubmit } from '../../utils/analytics';
import { validateDomain } from '../../utils/domainValidation';
import Footer from '../Footer';
import { renderIssueWithLinks } from '../../utils/text';
import DkimSelectorsModal from '../DkimSelectorsModal';
import { getDkimSelectors, saveDkimSelectors } from '../../utils/dkimSelectorsService';

const DomainScanner = () => {
  const { t } = useTranslation('common');
  const { t: tScanners } = useTranslation('scanners');
  const { runScanners, domainScanAggregate, scannerProgress } = useAppState();
  const [input, setInput] = useState(domainScanAggregate?.domain ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDkimModal, setShowDkimModal] = useState(false);
  const [currentDomain, setCurrentDomain] = useState<string>('');

  // Be defensive: some scans may omit `issues` on the aggregate
  const aggregateIssues: string[] = (domainScanAggregate?.issues ?? []) as string[];

  const onScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = input.trim();

    if (!trimmed) {
      setError(t('domainScanner.errors.enterDomain'));
      return;
    }

    if (!validateDomain(trimmed)) {
      setError(t('domainScanner.errors.invalidDomain'));
      return;
    }

    setLoading(true);

    // Track scan event
    trackFormSubmit('domain_scanner', { domain: trimmed });

    try {
      setCurrentDomain(trimmed);
      await runScanners(trimmed);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError(err?.message ?? t('domainScanner.errors.scanFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderScannerStatus = (status: string) => {
    const s = (status ?? '').toLowerCase();
    if (s === 'complete') return <span className='scanner-pill complete'>{t('domainScanner.complete')}</span>;
    if (s === 'error') return <span className='scanner-pill error'>{t('domainScanner.error')}</span>;
    if (s === 'running') return <span className='scanner-pill running'>{t('domainScanner.running')}</span>;
    return <span className='scanner-pill'>{t('domainScanner.pending')}</span>;
  };

  const renderSeverityBadge = (severity: string) => {
    const sev = (severity ?? '').toLowerCase();

    if (sev === 'critical') return <span className='severity-pill critical'>{t('domainScanner.severityCritical')}</span>;
    if (sev === 'error') return <span className='severity-pill error'>{t('domainScanner.severityError')}</span>;
    if (sev === 'warning') return <span className='severity-pill warning'>{t('domainScanner.severityWarning')}</span>;
    if (sev === 'info') return <span className='severity-pill info'>{t('domainScanner.severityInfo')}</span>;
    if (sev === 'good' || sev === 'success') return <span className='severity-pill good'>{t('domainScanner.severityGood')}</span>;

    return null;
  };

  const handleSaveDkimSelectors = (domain: string, selectors: string[]) => {
    saveDkimSelectors(domain, selectors);
  };

  return (
    <div className='page'>
      <div className='container'>
        <div className='card'>
          <h2 className='title'>{t('domainScanner.title', { defaultValue: 'Domain Assessment' })}</h2>
          <p className='subtitle'>
            {t('domainScanner.description', {
              defaultValue: 'Run lightweight DNS / email auth / certificate / header checks using public sources.',
            })}
          </p>

          <form onSubmit={onScan} className='scan-form'>
            <input
              type='text'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('domainScanner.placeholder', { defaultValue: 'example.com' })}
              className='domain-input'
              disabled={loading}
            />
            <TrackedButton
              trackingEvent='domain_scan_button'
              trackingData={{ domain: input }}
              type='submit'
              disabled={loading || !input.trim()}
              className='scan-button'
            >
              {loading ? t('domainScanner.scanning', { defaultValue: 'Scanning...' }) : t('domainScanner.scan', { defaultValue: 'Scan Domain' })}
            </TrackedButton>
          </form>

          {error && <div className='error-banner'>{error}</div>}

          <h3 className='section-title'>{t('domainScanner.scanners', { defaultValue: 'Scanners' })}</h3>

          <div className='scanner-list'>
            {SCANNERS.map((scanner) => {
              const prog = scannerProgress.find((p) => p.id === scanner.id);
              const status = prog?.status ?? 'pending';
              const scannerResult = domainScanAggregate?.scanners?.find((s) => s.id === scanner.id);

              const interpretation = scannerResult ? interpretScannerResult(scannerResult, 0) : null;

              return (
                <div key={scanner.id} className={`scanner-card ${status}`}>
                  <div className='scanner-header'>
                    <div className='scanner-title'>
                      <h4>{tScanners(scanner.label, { defaultValue: scanner.label })}</h4>
                      {interpretation && renderSeverityBadge(interpretation.severity)}
                    </div>
                    <div className='scanner-status'>{renderScannerStatus(status)}</div>
                  </div>

                  {scanner.description && (
                    <p className='scanner-description'>
                      {tScanners(scanner.description, { defaultValue: scanner.description })}
                    </p>
                  )}

                  {scannerResult?.summary && (
                    <div className='scanner-summary'>
                      <p>{scannerResult.summary}</p>
                    </div>
                  )}

                  {prog?.issues && prog.issues.length > 0 && (
                    <details className='scanner-details'>
                      <summary>
                        {t('domainScanner.issues', { count: prog.issues.length })}
                      </summary>
                      <ul className='scanner-issues'>
                        {prog.issues.map((i: string, idx: number) => (
                          <li key={idx}>{renderIssueWithLinks(i)}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {interpretation && (
                    <div className='scanner-interpretation'>
                      <p className='scanner-message'>{interpretation.message}</p>
                      {interpretation.recommendation && (
                        <p className='scanner-recommendation'>
                          <strong>{t('domainScanner.recommendation', { defaultValue: 'Recommendation:' })}</strong>{' '}
                          {interpretation.recommendation}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {domainScanAggregate && !loading && (
            <div className='aggregate'>
              <h3 className='section-title'>{t('domainScanner.aggregateResult')}</h3>
              <div className='aggregate-meta'>
                <p>
                  <strong>{t('domainScanner.domain')}:</strong> {domainScanAggregate.domain}
                </p>
                <p>
                  <strong>{t('domainScanner.timestamp')}:</strong>{' '}
                  {new Date(domainScanAggregate.timestamp).toLocaleString()}
                </p>
              </div>
              <h5>{t('domainScanner.allIssues')} ({aggregateIssues.length})</h5>
              {aggregateIssues.length ? (
                <ul className='aggregate-issues'>
                  {aggregateIssues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              ) : (
                <p className='no-issues'>{t('domainScanner.noIssuesDetected')}</p>
              )}
            </div>
          )}
        </div>
      </div>
      <p className='disclaimer'>
        {t('domainScanner.disclaimer')}
      </p>
      <Footer />

      {/* DKIM Selectors Modal */}
      {showDkimModal && currentDomain && (
        <DkimSelectorsModal
          isOpen={showDkimModal}
          onClose={() => setShowDkimModal(false)}
          onSave={handleSaveDkimSelectors}
          domain={currentDomain}
          existingSelectors={getDkimSelectors(currentDomain)}
        />
      )}
    </div>
  );
};

export default DomainScanner;
