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
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);

  const handleScan = async () => {
    const domain = input.trim();

    if (!domain) {
      setError(t('domainScanner.errors.enterDomain'));
      return;
    }

    if (!validateDomain(domain)) {
      setError(t('domainScanner.errors.invalidDomain'));
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentDomain(domain);

    trackFormSubmit('domain_scanner', { domain });

    try {
      await runScanners(domain);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error running scanners:', err);
      setError(t('domainScanner.errors.scanFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDkimModal = () => {
    const domain = input.trim();
    if (!domain || !validateDomain(domain)) {
      setError(t('domainScanner.errors.invalidDomain'));
      return;
    }
    setCurrentDomain(domain);
    setShowDkimModal(true);
  };

  const handleSaveDkimSelectors = (selectors: string[]) => {
    if (!currentDomain) return;
    saveDkimSelectors(currentDomain, selectors);
    setShowDkimModal(false);
  };

  const renderStatusBadge = (status?: string) => {
    const s = status ?? 'pending';
    if (s === 'complete') return <span className='status complete'>COMPLETE</span>;
    if (s === 'error') return <span className='status error'>ERROR</span>;
    if (s === 'running') return <span className='status running'>RUNNING</span>;
    return <span className='status pending'>PENDING</span>;
  };

  const renderSeverityBadge = (severity?: string) => {
    if (!severity) return null;
    return <span className={`severity ${severity}`}>{severity.toUpperCase()}</span>;
  };

  return (
    <div className='domain-scanner-page'>
      <div className='card domain-scanner'>
        <h2>{t('domainScanner.title')}</h2>
        <p>{t('domainScanner.description')}</p>

        <div className='domain-input'>
          <input
            type='text'
            value={input}
            placeholder={t('domainScanner.placeholder')}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading}
          />
          <TrackedButton
            trackingEvent='domain_scan_button'
            trackingData={{ domain: input }}
            onClick={handleScan}
            disabled={loading || !input.trim()}
          >
            {loading ? t('domainScanner.scanning') : t('domainScanner.scan')}
          </TrackedButton>
        </div>

        {error && (
          <p className='error'>
            {t('domainScanner.errorPrefix')} {error}
          </p>
        )}

        <h3>{t('domainScanner.scanners')}</h3>

        <ul className='scanner-list'>
          {SCANNERS.map((scanner) => {
            const prog = scannerProgress.find((p) => p.id === scanner.id);
            const interpretation = prog ? interpretScannerResult(prog, 0) : null;

            return (
              <li key={scanner.id} className='scanner-item'>
                <div className='scanner-header'>
                  <div className='scanner-title'>
                    <strong>{tScanners(scanner.label)}</strong>
                    {interpretation && renderSeverityBadge(interpretation.severity)}
                  </div>
                  <div className='scanner-state'>{renderStatusBadge(prog?.status)}</div>
                </div>

                {scanner.description && <p className='scanner-desc'>{tScanners(scanner.description)}</p>}

                {prog?.summary && <p className='scanner-summary'>{prog.summary}</p>}

                {prog?.issues && prog.issues.length > 0 && (
                  <details className='scanner-issues'>
                    <summary>{t('domainScanner.issues', { count: prog.issues.length })}</summary>
                    <ul>
                      {prog.issues.map((issue, idx) => (
                        <li key={idx}>{renderIssueWithLinks(issue)}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {scanner.id === 'dkim' && (
                  <div className='dkim-manage'>
                    <div className='dkim-prompt'>{t('domainScanner.dkimPrompt.text')}</div>
                    <div className='dkim-actions'>
                      <button type='button' onClick={handleOpenDkimModal} className='manage-selectors-btn'>
                        <svg className='btn-icon' viewBox='0 0 24 24' fill='currentColor'>
                          <path
                            d={
                              'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23'
                              + '-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62'
                              + '-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c'
                              + '-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08'
                              + '.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23'
                              + '.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c'
                              + '.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62'
                              + '-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z'
                              + 'M12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6'
                              + '-3.6 3.6z'
                            }
                          />
                        </svg>
                        {t('domainScanner.dkimPrompt.manageButton')}
                      </button>
                    </div>
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
                  <li key={idx}>{renderIssueWithLinks(i)}</li>
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
