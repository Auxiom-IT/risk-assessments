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

  // ✅ Defensive: some aggregates may omit `issues`
  const aggregateIssues = domainScanAggregate?.issues ?? [];

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
    trackFormSubmit('domain_scan', { domain: validation.normalizedDomain });

    try {
      // Use normalized domain for scanning
      await runScanners(validation.normalizedDomain!);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('domainScanner.errors.scanFailed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDkimModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDkimModal(true);
  };

  const handleSaveDkimSelectors = async (selectors: string[]) => {
    if (currentDomain) {
      const saved = saveDkimSelectors(currentDomain, selectors);
      if (!saved) {
        // Show an error if saving selectors failed (e.g., localStorage unavailable/full)
        setError(t('domainScanner.errors.scanFailed'));
        return;
      }
      setShowDkimModal(false);
      // Trigger a rescan to check with new selectors
      setLoading(true);
      try {
        await runScanners(currentDomain);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('domainScanner.errors.scanFailed');
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className='panel'>
      <h2>{t('domainScanner.title')}</h2>
      <p>{t('domainScanner.description')}</p>

      <form onSubmit={onScan} className='domain-form'>
        <input
          type='text'
          placeholder={t('domainScanner.placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <TrackedButton type='submit' disabled={loading} trackingName='domain_scan_submit'>
          <span className='button-text-full'>
            {loading ? t('domainScanner.scanning') : t('domainScanner.scanButton')}
          </span>
          <span className='button-text-short'>
            {loading ? t('domainScanner.scanning') : t('domainScanner.scan')}
          </span>
        </TrackedButton>
      </form>

      {error && <div className='error'>{error}</div>}

      <div className='modular-results'>
        <h3>{t('domainScanner.scanners')}</h3>

        <ul className='scanner-list'>
          {SCANNERS.map((s) => {
            const prog = scannerProgress.find((p) => p.id === s.id);
            const status = prog?.status ?? 'idle';
            const interpretation = prog ? interpretScannerResult(prog) : null;

            // Status icons
            const getStatusIcon = () => {
              switch (status) {
                case 'complete':
                  return '✓';
                case 'error':
                  return '✕';
                case 'running':
                  return '⟳';
                default:
                  return '○';
              }
            };

            // Severity badge component
            const renderSeverityBadge = () => {
              if (!interpretation) return null;
              const severityClass = `severity-badge severity-${interpretation.severity}`;
              const severityLabel =
                {
                  success: t('domainScanner.severityGood'),
                  info: t('domainScanner.severityInfo'),
                  warning: t('domainScanner.severityWarning'),
                  critical: t('domainScanner.severityCritical'),
                  error: t('domainScanner.severityError'),
                }[interpretation.severity] ?? '';

              return <span className={severityClass}>{severityLabel}</span>;
            };

            return (
              <li key={s.id} className={`scanner scanner-${status}`}>
                <div className='scanner-header'>
                  <div className='scanner-title'>
                    <span className={`status-icon status-icon-${status}`}>{getStatusIcon()}</span>
                    <strong>{tScanners(`${s.id}.label`)}</strong>
                    {renderSeverityBadge()}
                  </div>
                  <span className='status-text'>{status}</span>
                </div>

                <div className='scanner-description'>{tScanners(`${s.id}.description`)}</div>

                {prog?.dataSource && (
                  <div className='scanner-source'>
                    {t('domainScanner.dataSource')}{' '}
                    <a href={prog.dataSource.url} target='_blank' rel='noopener noreferrer'>
                      {prog.dataSource.name}
                    </a>
                  </div>
                )}

                {prog?.summary && <div className='scanner-summary'>{prog.summary}</div>}

                {interpretation && (
                  <div className={`interpretation interpretation-${interpretation.severity}`}>
                    <div className='interpretation-message'>{interpretation.message}</div>
                    <div className='interpretation-recommendation'>{interpretation.recommendation}</div>

                    {s.id === 'sslLabs' && prog?.data && (prog.data as { testUrl?: string }).testUrl ? (
                      <div className='external-link'>
                        <a
                          href={(prog.data as { testUrl?: string }).testUrl!}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='btn-link'
                        >
                          {t('domainScanner.viewFullSSLReport')}
                        </a>
                      </div>
                    ) : null}

                    {s.id === 'securityHeaders' && prog?.data && (prog.data as { testUrl?: string }).testUrl ? (
                      <div className='external-link'>
                        <a
                          href={(prog.data as { testUrl?: string }).testUrl!}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='btn-link'
                        >
                          {t('domainScanner.viewFullSecurityHeadersReport')}
                        </a>
                      </div>
                    ) : null}

                    {s.id === 'dkim' ? (
                      <div className='external-link'>
                        <a href='#' onClick={handleOpenDkimModal} className='btn-link'>
                          {t('domainScanner.manageDkimSelectors')}
                        </a>
                      </div>
                    ) : null}
                  </div>
                )}

                {prog?.status === 'error' && prog.error && (
                  <div className='error-detail'>
                    {t('domainScanner.errorPrefix')} {prog.error}
                  </div>
                )}

                {prog?.issues && prog.issues.length > 0 && (
                  <details className='issues-details'>
                    <summary>{t('domainScanner.issues', { count: prog.issues.length })}</summary>
                    <ul className='issues-list'>{prog.issues.map((i, idx) => renderIssueWithLinks(i, idx))}</ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        {domainScanAggregate && (
          <div className='aggregate-results'>
            <h4>{t('domainScanner.aggregateResult')}</h4>
            <div className='aggregate-summary'>{domainScanAggregate.summary}</div>

            <div className='aggregate-meta'>
              <p>
                <strong>{t('domainScanner.domain')}:</strong> {domainScanAggregate.domain}
              </p>
              <p>
                <strong>{t('domainScanner.timestamp')}:</strong>{' '}
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
