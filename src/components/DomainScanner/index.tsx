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
  const aggregateIssues = domainScanAggregate?.issues ?? [];

  const [input, setInput] = useState(domainScanAggregate?.domain ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDkimModal, setShowDkimModal] = useState(false);
  const [currentDomain, setCurrentDomain] = useState<string>('');

  const onScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!input.trim()) {
      setError(t('domainScanner.errors.enterDomain'));
      return;
    }

    // Validate domain using URL constructor
    const validation = validateDomain(input);
    if (!validation.isValid) {
      setError(validation.error ?? t('domainScanner.errors.invalidDomain'));
      return;
    }

    setLoading(true);
    setCurrentDomain(validation.normalizedDomain!);

    // Track scan event
    trackFormSubmit('domain_scanner', { domain: validation.normalizedDomain });

    try {
      await runScanners(validation.normalizedDomain!);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error running scanners:', err);
      setError(t('domainScanner.errors.scanFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'complete') return <span className='status complete'>COMPLETE</span>;
    if (status === 'running') return <span className='status running'>RUNNING</span>;
    if (status === 'error') return <span className='status error'>ERROR</span>;
    return <span className='status pending'>PENDING</span>;
  };

  const renderSeverityBadge = (severity: string) => {
    if (severity === 'critical') return <span className='severity critical'>Critical</span>;
    if (severity === 'warning') return <span className='severity warning'>Warning</span>;
    if (severity === 'info') return <span className='severity info'>Info</span>;
    return <span className='severity good'>Good</span>;
  };

  const handleSaveDkimSelectors = async (selectors: string[]) => {
    if (!currentDomain) return;
    await saveDkimSelectors(currentDomain, selectors);
    setShowDkimModal(false);
  };

  return (
    <div className='domain-scanner'>
      <div className='scanner-container'>
        <h2>{t('domainScanner.title')}</h2>
        <p>{t('domainScanner.description')}</p>

        <form onSubmit={onScan} className='scanner-form'>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('domainScanner.placeholder')}
            disabled={loading}
            className='domain-input'
          />
          <TrackedButton
            type='submit'
            trackingEvent='domain_scan_button'
            trackingData={{ domain: input }}
            disabled={loading || !input.trim()}
            className='scan-button'
          >
            {loading ? t('domainScanner.scanning') : t('domainScanner.scan')}
          </TrackedButton>
        </form>

        {error && <div className='error'>{error}</div>}

        <h3>{t('domainScanner.scanners')}</h3>
        <ul className='scanner-list'>
          {SCANNERS.map((scanner) => {
            const prog = scannerProgress.find((p) => p.id === scanner.id);
            const status = prog?.status ?? 'pending';
            const issues = prog?.issues ?? [];
            const interpretation = prog ? interpretScannerResult(prog, 0) : null;

            return (
              <li key={scanner.id} className='scanner-item'>
                <div className='scanner-header'>
                  <div className='scanner-title'>
                    <span className='scanner-icon'>{status === 'complete' ? '✅' : '⏳'}</span>
                    <span className='scanner-name'>{tScanners(scanner.label)}</span>
                    {interpretation && renderSeverityBadge(interpretation.severity)}
                  </div>
                  {renderStatusBadge(status)}
                </div>

                <div className='scanner-description'>{tScanners(scanner.description)}</div>

                {prog?.summary && <div className='scanner-summary'>{prog.summary}</div>}

                {prog?.issues && prog.issues.length > 0 && (
                  <details className='scanner-issues'>
                    <summary>{t('domainScanner.issues', { count: prog.issues.length })}</summary>
                    <ul>
                      {prog.issues.map((i, idx) => renderIssueWithLinks(i, idx))}
                    </ul>
                  </details>
                )}

                {prog?.issues &&
                  prog.issues.some(
                    (issue: string) => issue === t('emailAuth.issues.noDKIM', { ns: 'scanners' })
                  ) && (
                    <div className='dkim-prompt'>
                      <p>{t('domainScanner.dkimPrompt.message')}</p>
                      <button
                        type='button'
                        className='dkim-button'
                        onClick={() => {
                          setCurrentDomain(input.trim());
                          setShowDkimModal(true);
                        }}
                      >
                        <svg
                          width='18'
                          height='18'
                          viewBox='0 0 24 24'
                          fill='currentColor'
                          xmlns='http://www.w3.org/2000/svg'
                          style={{ marginRight: 8 }}
                        >
                          <path
                            d={
                              'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c'
                              + '.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96'
                              + 'c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.03-.24-.23-.41-.47-.41h-3.84'
                              + 'c-.24 0-.44.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96'
                              + 'c-.22-.08-.47 0-.59.22l-1.92 3.32c-.12.22-.07.47.12.61l2.03 1.58'
                              + 'c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92'
                              + ' 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c'
                              + '.03.24.23.41.47.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56'
                              + ' 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z'
                              + 'M12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6'
                              + '-3.6 3.6z'
                            }
                          />
                        </svg>
                        {t('domainScanner.dkimPrompt.manageButton')}
                      </button>
                    </div>
                  )}
              </li>
            );
          })}
        </ul>

        {domainScanAggregate && (
          <div className='aggregate'>
            <h4>{t('domainScanner.aggregateResult')}</h4>
            <div className='aggregate-info'>
              <p>
                <strong>{t('domainScanner.domain')}</strong> {domainScanAggregate.domain}
              </p>
              <p>
                <strong>{t('domainScanner.timestamp')}</strong>{' '}
                {new Date(domainScanAggregate.timestamp).toLocaleString()}
              </p>
            </div>

            <h5>
              {t('domainScanner.allIssues')} ({aggregateIssues.length})
            </h5>

            {aggregateIssues.length ? (
              <ul className='aggregate-issues'>
                {aggregateIssues.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            ) : (
              <p className='no-issues'>{t('domainScanner.noIssuesDetected')}</p>
            )}
          </div>
        )}
      </div>

      <p className='disclaimer'>{t('domainScanner.disclaimer')}</p>
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
