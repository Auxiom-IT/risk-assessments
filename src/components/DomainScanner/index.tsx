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
      await runScanners(currentDomain);
    }
  };

  const handleCloseDkimModal = () => {
    setShowDkimModal(false);
  };

  const handleOpenDkimModalForDomain = (domain: string) => {
    setCurrentDomain(domain);
    setShowDkimModal(true);
  };

  const dkimSelectors = currentDomain ? getDkimSelectors(currentDomain) : [];

  return (
    <div className='page'>
      <div className='container'>
        <h2>{t('domainScanner.title')}</h2>
        <p className='muted'>{t('domainScanner.description')}</p>

        <form onSubmit={onScan} className='domain-form'>
          <input
            className='domain-input'
            placeholder={t('domainScanner.inputPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <TrackedButton
            type='submit'
            className='btn'
            disabled={loading}
            eventName='domain_scan_button'
          >
            {loading ? t('domainScanner.scanning') : t('domainScanner.scanButton')}
          </TrackedButton>
        </form>

        {error && <div className='error'>{error}</div>}

        {scannerProgress && scannerProgress.length > 0 && (
          <div className='scanner-progress'>
            <h3>{t('domainScanner.scannerProgress')}</h3>
            <div className='scanner-grid'>
              {SCANNERS.map((s) => {
                const prog = scannerProgress.find((p) => p.id === s.id);
                const interpretation = prog ? interpretScannerResult(prog) : null;

                return (
                  <div key={s.id} className={`scanner-card scanner-card-${prog?.status ?? 'pending'}`}>
                    <div className='scanner-card-header'>
                      <span className='scanner-card-title'>{tScanners(s.label)}</span>
                      <span className={`scanner-card-status scanner-card-status-${prog?.status ?? 'pending'}`}>
                        {prog?.status ?? 'pending'}
                      </span>
                    </div>

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
                        <ul className='issues-list'>
                          {prog.issues.map((iss, idx) => renderIssueWithLinks(iss, idx))}
                        </ul>
                      </details>
                    )}

                    {s.id === 'emailAuth' && (
                      <div className='dkim-actions'>
                        <TrackedButton
                          className='btn-secondary btn-small'
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenDkimModalForDomain(currentDomain || input);
                          }}
                          eventName='open_dkim_modal'
                        >
                          {t('domainScanner.configureDkimSelectors')}
                        </TrackedButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {domainScanAggregate && (
          <div className='scan-results'>
            <h3>{t('domainScanner.resultsTitle')}</h3>
            <p className='muted'>
              {t('domainScanner.scannedDomain')} <strong>{domainScanAggregate.domain}</strong>
            </p>
          </div>
        )}
      </div>

      <DkimSelectorsModal
        isOpen={showDkimModal}
        onClose={handleCloseDkimModal}
        onSave={handleSaveDkimSelectors}
        initialSelectors={dkimSelectors}
        domain={currentDomain || input}
      />

      <Footer />
    </div>
  );
};

export default DomainScanner;
