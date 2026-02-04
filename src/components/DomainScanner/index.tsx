import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../../context/AppStateContext';
import { SCANNERS, interpretScannerResult } from '../../utils/scanners';
import { TrackedButton } from '../TrackedButton';
import { trackFormSubmit } from '../../utils/analytics';
import { validateDomain } from '../../utils/domainValidation';
import { DkimSelectorsModal } from '../DkimSelectorsModal';
import styles from './DomainScanner.module.css';

const DomainScanner: React.FC = () => {
  const { runScanners, domainScanAggregate, scannerProgress } = useAppState();
  const { t } = useTranslation('common');

  // Be defensive: older imports / partially-failed scans may omit `issues`
  const aggregateIssues = domainScanAggregate?.issues ?? [];

  const [domain, setDomain] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDkimModal, setShowDkimModal] = useState(false);

  const handleScan = async () => {
    const trimmedDomain = domain.trim();

    if (!trimmedDomain) {
      setError(t('domainScanner.errors.enterDomain'));
      return;
    }

    if (!validateDomain(trimmedDomain)) {
      setError(t('domainScanner.errors.invalidDomain'));
      return;
    }

    setIsScanning(true);
    setError(null);

    // Track scan event
    trackFormSubmit('domain_scanner', { domain: trimmedDomain });

    try {
      await runScanners(trimmedDomain);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error running scanners:', err);
      setError(t('domainScanner.errors.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDomain(e.target.value);
    if (error) setError(null);
  };

  const renderScannerStatus = (status: string) => {
    switch (status) {
      case 'complete':
        return <span className={`${styles.status} ${styles.complete}`}>COMPLETE</span>;
      case 'error':
        return <span className={`${styles.status} ${styles.error}`}>ERROR</span>;
      case 'running':
        return <span className={`${styles.status} ${styles.running}`}>RUNNING</span>;
      default:
        return <span className={styles.status}>PENDING</span>;
    }
  };

  const renderSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <span className={`${styles.severity} ${styles.critical}`}>{t('domainScanner.severityCritical')}</span>;
      case 'error':
        return <span className={`${styles.severity} ${styles.error}`}>{t('domainScanner.severityError')}</span>;
      case 'warning':
        return <span className={`${styles.severity} ${styles.warning}`}>{t('domainScanner.severityWarning')}</span>;
      case 'info':
        return <span className={`${styles.severity} ${styles.info}`}>{t('domainScanner.severityInfo')}</span>;
      case 'good':
        return <span className={`${styles.severity} ${styles.good}`}>{t('domainScanner.severityGood')}</span>;
      default:
        return null;
    }
  };

  const renderScannerResult = (scannerResult: any) => {
    const interpretation = interpretScannerResult(scannerResult, 0);

    return (
      <div className={styles.scannerResult}>
        <div className={styles.scannerHeader}>
          <h3>{scannerResult.label}</h3>
          <div className={styles.scannerStatusContainer}>
            {renderSeverityBadge(interpretation.severity)}
            {renderScannerStatus(scannerResult.status)}
          </div>
        </div>

        {scannerResult.summary && <p className={styles.summary}>{scannerResult.summary}</p>}

        {scannerResult.issues?.length > 0 && (
          <div className={styles.issues}>
            <h4>{t('domainScanner.allIssues')}</h4>
            <ul>
              {scannerResult.issues.map((issue: string, index: number) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.recommendationBox}>
          <p className={styles.message}>{interpretation.message}</p>
          {interpretation.recommendation && (
            <p className={styles.recommendation}>
              <strong>Recommendation:</strong> {interpretation.recommendation}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1>{t('domainScanner.title')}</h1>
        <p className={styles.description}>{t('domainScanner.description')}</p>

        <div className={styles.inputContainer}>
          <input
            type="text"
            value={domain}
            onChange={handleDomainChange}
            placeholder={t('domainScanner.placeholder')}
            disabled={isScanning}
            className={styles.input}
          />
          <TrackedButton
            trackingEvent="domain_scan_button"
            trackingData={{ domain }}
            onClick={handleScan}
            disabled={isScanning || !domain.trim()}
            className={styles.button}
          >
            {isScanning ? t('domainScanner.scanning') : t('domainScanner.scan')}
          </TrackedButton>
        </div>

        {error && (
          <div className={styles.error}>
            <strong>{t('domainScanner.errorPrefix')}</strong> {error}
          </div>
        )}

        {isScanning && (
          <div className={styles.progressSection}>
            <h2>{t('domainScanner.scannerProgress', { defaultValue: 'Scanner progress' })}</h2>
            <div className={styles.progressList}>
              {SCANNERS.map((s) => {
                const prog = scannerProgress.find((p) => p.id === s.id);
                const status = prog?.status ?? 'pending';
                return (
                  <div key={s.id} className={styles.progressItem}>
                    <span className={styles.progressLabel}>{s.label}</span>
                    {renderScannerStatus(status)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {domainScanAggregate && !isScanning && (
          <div className={styles.resultsSection}>
            <div className={styles.aggregateHeader}>
              <h2>{t('domainScanner.aggregateResult')}</h2>
              <div className={styles.aggregateMeta}>
                <span>
                  <strong>{t('domainScanner.domain')}:</strong> {domainScanAggregate.domain}
                </span>
                <span>
                  <strong>{t('domainScanner.timestamp')}:</strong>{' '}
                  {new Date(domainScanAggregate.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            <div className={styles.aggregateSummary}>
              <p>{domainScanAggregate.summary}</p>
              <div className={styles.issueCount}>
                <strong>{aggregateIssues.length}</strong>{' '}
                {aggregateIssues.length === 1 ? 'issue' : 'issues'} found
              </div>
            </div>

            <div className={styles.dataSource}>
              <p>
                <strong>{t('domainScanner.dataSource')}:</strong> {t('domainScanner.disclaimer')}
              </p>
            </div>

            <div className={styles.resultsList}>
              {(domainScanAggregate.scanners ?? []).map((scanner) => (
                <div key={scanner.id} className={styles.resultItem}>
                  {renderScannerResult(scanner)}
                </div>
              ))}
            </div>

            <div className={styles.extraActions}>
              <TrackedButton
                trackingEvent="dkim_selectors_manage"
                onClick={() => setShowDkimModal(true)}
                className={styles.secondaryButton}
              >
                {t('domainScanner.dkimPrompt.manageButton')}
              </TrackedButton>
            </div>
          </div>
        )}
      </div>

      {showDkimModal && <DkimSelectorsModal onClose={() => setShowDkimModal(false)} />}
    </div>
  );
};

export default DomainScanner;
