import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../../context/AppStateContext';
import type { DomainScanAggregate } from '../../types/domainScan';
import { interpretScannerResult } from '../../utils/scanners';
import { renderIssueWithLinks } from '../../utils/text';
import { TrackedLink } from '../TrackedLink';

const Report = () => {
  const { t } = useTranslation('common');
  const { t: tScanners } = useTranslation('scanners');
  const { domainScanAggregate } = useAppState();

  if (!domainScanAggregate) return null;

  const aggregatedIssues: string[] = [];
  domainScanAggregate.scanners.forEach((s) => {
    if (s.issues && s.issues.length > 0) aggregatedIssues.push(...s.issues);
  });

  const renderLimitations = () => (
    <div className='report-section'>
      <h4>{t('report.limitations')}</h4>
      <p>{t('report.limitationsText')}</p>
    </div>
  );

  return (
    <div className='report'>
      <div className='report-section'>
        <h3>{t('report.title')}</h3>
        <p className='muted'>
          {t('report.domain')}: <strong>{domainScanAggregate.domain}</strong>
        </p>
      </div>

      <div className='report-section'>
        <h4>{t('report.scanResults')}</h4>
        <div className='scanner-results-grid'>
          {domainScanAggregate.scanners.map((sc) => {
            const interp = interpretScannerResult(sc);
            return (
              <div key={sc.id} className={`scanner-card scanner-card-${sc.status}`}>
                <div className='scanner-card-header'>
                  <span className='scanner-card-title'>{tScanners(sc.label)}</span>
                  <span className={`scanner-card-status scanner-card-status-${sc.status}`}>{sc.status}</span>
                </div>
                {sc.summary && <div className='scanner-card-summary'>{sc.summary}</div>}
                <div className={`scanner-card-interpretation sev-${interp.severity}`}>
                  <strong>{interp.message}</strong>
                  <div className='scanner-card-recommendation'>{interp.recommendation}</div>
                </div>
                {sc.issues && sc.issues.length > 0 && (
                  <ul className='scanner-card-issues'>
                    {sc.issues.map((iss, idx) => renderIssueWithLinks(iss, idx))}
                  </ul>
                )}

                {sc.id === 'securityHeaders' && sc.data && (sc.data as { testUrl?: string }).testUrl ? (
                  <div className='scanner-card-link'>
                    <TrackedLink
                      href={(sc.data as { testUrl?: string }).testUrl!}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {t('report.fullHeaderAnalysis')} ↗
                    </TrackedLink>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className='report-section'>
        <h4>{t('report.aggregatedIssues')}</h4>
        {aggregatedIssues.length === 0 ? (
          <p className='muted'>{t('report.noAggregatedIssues')}</p>
        ) : (
          <ul className='issues-list'>
            {aggregatedIssues.map((iss, idx) => renderIssueWithLinks(iss, idx))}
          </ul>
        )}
      </div>

      {renderLimitations()}
    </div>
  );
};

export default Report;
