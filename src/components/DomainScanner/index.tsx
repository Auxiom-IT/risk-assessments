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

  // Defensive: some scans may omit `issues` on the aggregate object
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

  const openDkimModal = () => {
    if (!domainScanAggregate?.domain) return;
    setCurrentDomain(domainScanAggregate.domain);
    setShowDkimModal(true);
  };

  const closeDkimModal = () => setShowDkimModal(false);

  const handleSaveDkimSelectors = (selectors: string[]) => {
    if (!currentDomain) return;
    saveDkimSelectors(currentDomain, selectors);
    setShowDkimModal(false);
  };

  const existingSelectors = currentDomain ? getDkimSelectors(currentDomain) : [];

  return (
    <div className="DomainScanner">
      <div className="DomainScanner__card">
        <h2 className="DomainScanner__title">{t('domainScanner.title')}</h2>
        <p className="DomainScanner__subtitle">{t('domainScanner.description')}</p>

        <form className="DomainScanner__form" onSubmit={onScan}>
          <input
            className="DomainScanner__input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('domainScanner.placeholder')}
            disabled={loading}
          />

          <TrackedButton
            className="DomainScanner__button"
            trackingEvent="domain_scan_button"
            trackingData={{ domain: input }}
            disabled={loading}
            type="submit"
          >
            {loading ? t('domainScanner.scanning') : t('domainScanner.scan')}
          </TrackedButton>
        </form>

        {error && <p className="DomainScanner__error">{error}</p>}

        {!!scannerProgress?.length && (
          <div className="DomainScanner__progress">
            <h4 className="DomainScanner__sectionTitle">{t('domainScanner.scannerProgress')}</h4>
            <ul className="DomainScanner__progressList">
              {SCANNERS.map((scanner) => {
                const prog = scannerProgress.find((p) => p.id === scanner.id);
                const status = prog?.status ?? 'pending';
                const issues = prog?.issues ?? [];
                return (
                  <li key={scanner.id} className="DomainScanner__progressItem">
                    <span className="DomainScanner__progressLabel">{scanner.label}</span>
                    <span className={`DomainScanner__progressStatus DomainScanner__progressStatus--${status}`}>
                      {status}
                    </span>
                    {!!issues.length && (
                      <span className="DomainScanner__progressIssues">({issues.length} issues)</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {domainScanAggregate && !loading && (
          <div className="DomainScanner__results">
            <div className="DomainScanner__resultsHeader">
              <h3 className="DomainScanner__sectionTitle">{t('domainScanner.aggregateResult')}</h3>
              <div className="DomainScanner__meta">
                <span>
                  <strong>{t('domainScanner.domain')}:</strong> {domainScanAggregate.domain}
                </span>
                <span>
                  <strong>{t('domainScanner.timestamp')}:</strong>{' '}
                  {new Date(domainScanAggregate.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="DomainScanner__summary">
              <p>{domainScanAggregate.summary}</p>
            </div>

            <div className="DomainScanner__issues">
              <h5>
                {t('domainScanner.allIssues')} ({aggregateIssues.length})
              </h5>

              {aggregateIssues.length ? (
                <ul>
                  {aggregateIssues.map((issue, idx) => (
                    <li key={idx}>{renderIssueWithLinks(issue)}</li>
                  ))}
                </ul>
              ) : (
                <p className="DomainScanner__noIssues">{t('domainScanner.noIssuesFound')}</p>
              )}
            </div>

            <div className="DomainScanner__scanners">
              {domainScanAggregate.scanners?.map((scanner) => {
                const interpretation = interpretScannerResult(scanner, 0);
                return (
                  <div key={scanner.id} className="DomainScanner__scannerCard">
                    <div className="DomainScanner__scannerHeader">
                      <div className="DomainScanner__scannerTitle">
                        <h4>{tScanners(scanner.label)}</h4>
                        <span className={`DomainScanner__badge DomainScanner__badge--${interpretation.severity}`}>
                          {interpretation.severity}
                        </span>
                      </div>
                      <span className={`DomainScanner__status DomainScanner__status--${scanner.status}`}>
                        {scanner.status}
                      </span>
                    </div>

                    {scanner.description && <p className="DomainScanner__scannerDesc">{scanner.description}</p>}
                    {scanner.summary && <p className="DomainScanner__scannerSummary">{scanner.summary}</p>}

                    {!!scanner.issues?.length && (
                      <div className="DomainScanner__scannerIssues">
                        <ul>
                          {scanner.issues.map((issue: string, idx: number) => (
                            <li key={idx}>{renderIssueWithLinks(issue)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="DomainScanner__recommendation">
                      <p className="DomainScanner__message">{interpretation.message}</p>
                      {interpretation.recommendation && (
                        <p className="DomainScanner__recommendationText">
                          <strong>{t('domainScanner.recommendation')}:</strong> {interpretation.recommendation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="DomainScanner__actions">
              <TrackedButton
                className="DomainScanner__secondaryButton"
                trackingEvent="dkim_selectors_manage"
                onClick={openDkimModal}
              >
                {t('domainScanner.dkimPrompt.manageButton')}
              </TrackedButton>
            </div>
          </div>
        )}
      </div>

      <Footer />

      {showDkimModal && (
        <DkimSelectorsModal
          isOpen={showDkimModal}
          onClose={closeDkimModal}
          onSave={handleSaveDkimSelectors}
          domain={currentDomain}
          existingSelectors={existingSelectors}
        />
      )}
    </div>
  );
};

export default DomainScanner;
