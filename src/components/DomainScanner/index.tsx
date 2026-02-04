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

  // ✅ FIX: Some scan results may not include `issues`
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
                  error: t('domainScanner.severityError')
                }[interpretation.severity] ?? interpretation.severity;

              return <span className={severityClass}>{severityLabel}</span>;
            };

            return (
              <li key={s.id} className={`scanner-card scanner-${status}`}>
                <div className='scanner-header'>
                  <div className='scanner-icon'>{getStatusIcon()}</div>
                  <div className='scanner-info'>
                    <div className='scanner-title'>
                      <h4>{tScanners(s.label)}</h4>
                      {renderSeverityBadge()}
                    </div>
                    <p className='scanner-description'>{tScanners(s.description)}</p>
                    {s.id === 'emailAuth' && (
                      <button type='button' className='dkim-modal-button' onClick={handleOpenDkimModal}>
                        {t('domainScanner.dkimPrompt.manageButton')}
                      </button>
                    )}
                  </div>
                  <div className='scanner-status'>{status.toUpperCase()}</div>
                </div>

                {prog?.summary && <p className='scanner-summary'>{prog.summary}</p>}

                {prog?.issues?.length ? (
                  <div className='scanner-issues'>
                    <h5>{t('domainScanner.issuesDetected')}</h5>
                    <ul>
                      {prog.issues.map((issue, i) => (
                        <li key={i}>{renderIssueWithLinks(issue)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {interpretation?.message ? (
                  <div className={`scanner-recommendation recommendation-${interpretation.severity}`}>
                    <p className='recommendation-message'>{interpretation.message}</p>
                    {interpretation.recommendation ? (
                      <p className='recommendation-action'>
                        <strong>{t('domainScanner.recommendation')}:</strong> {interpretation.recommendation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {domainScanAggregate && !loading && (
          <div className='aggregate-results'>
            <h3>{t('domainScanner.aggregateResult')}</h3>
            <p className='aggregate-summary'>{domainScanAggregate.summary}</p>

            <div className='aggregate-info'>
              <p>
                <strong>{t('domainScanner.domain')}</strong> {domainScanAggregate.domain}
              </p>
              <p>
                <strong>{t('domainScanner.timestamp')}</strong>{' '}
                {new Date(domainScanAggregate.timestamp).toLocaleString()}
              </p>
            </div>

            {/* ✅ FIX: use safe aggregateIssues instead of domainScanAggregate.issues */}
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
