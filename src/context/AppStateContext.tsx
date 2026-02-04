import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import questionsData from '../data/questions.json';
import { Question, RawQuestion } from '../types/questions';
import { computeScore, ScoreResult } from '../utils/scoring';
import { mapRisks, RiskMappingResult } from '../utils/recommendations';
import { DomainScanResult } from '../utils/domainChecks';
import { runAllScanners } from '../utils/scanners';
import { DomainScanAggregate, ExecutedScannerResult } from '../types/domainScan';
import { APP_CONFIG } from '../config/appConfig';
import * as amplitude from '@amplitude/analytics-browser';
import { trackEvent, trackImport } from '../utils/analytics';
import { scannerCache } from '../utils/scannerCache';
import { validateImportJSON } from '../utils/importValidation';
import { useTranslatedQuestions } from '../utils/questionTranslation';
import { migrateAnswers, needsMigration } from '../utils/answerMigration';
import { useTranslation } from 'react-i18next';

interface AppStateContextValue {
  questions: Question[];
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  resetAnswers: () => void;
  resetAll: () => void;
  score: ScoreResult;
  risks: string[];
  bestPractices: string[];
  domainScan?: DomainScanResult;
  // New aggregated scanner state
  domainScanAggregate?: DomainScanAggregate;
  scannerProgress: ExecutedScannerResult[];
  runScanners: (domain: string) => Promise<void>;
  exportJSON: () => string;
  importJSON: (json: string) => { success: boolean; error?: string };
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

const ANSWERS_KEY = 'answers';
const DOMAIN_KEY = 'domainScan';
const DOMAIN_AGG_KEY = 'domainScanAggregate';

// Ensure older cached/persisted aggregates never have missing arrays.
// This prevents runtime "issues is undefined" crashes when UI does `.issues.length`.
function normalizeDomainScanAggregate(
  input: unknown
): DomainScanAggregate | undefined {
  if (!input || typeof input !== 'object') return undefined;

  const agg = input as Partial<DomainScanAggregate>;

  const scanners: ExecutedScannerResult[] = Array.isArray(agg.scanners)
    ? agg.scanners.map((s) => ({
        ...(s as ExecutedScannerResult),
        issues: Array.isArray((s as ExecutedScannerResult).issues)
          ? (s as ExecutedScannerResult).issues
          : [],
      }))
    : [];

  return {
    domain: typeof agg.domain === 'string' ? agg.domain : '',
    timestamp: typeof agg.timestamp === 'string' ? agg.timestamp : new Date().toISOString(),
    scanners,
    issues: Array.isArray(agg.issues) ? agg.issues : [],
  };
}

function loadStored<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const translatedQuestions = useTranslatedQuestions(i18n.language, questionsData as RawQuestion[]);

  const [questions, setQuestions] = useState<Question[]>(translatedQuestions);

  const [answers, setAnswers] = useState<Record<string, string>>(() => loadStored(ANSWERS_KEY) || {});
  const [domainScan, setDomainScan] = useState<DomainScanResult | undefined>(() => loadStored(DOMAIN_KEY));

  const [domainScanAggregate, setDomainScanAggregate] = useState<DomainScanAggregate | undefined>(() =>
    normalizeDomainScanAggregate(loadStored(DOMAIN_AGG_KEY))
  );
  const [scannerProgress, setScannerProgress] = useState<ExecutedScannerResult[]>(() => {
    const agg = normalizeDomainScanAggregate(loadStored(DOMAIN_AGG_KEY));
    return agg?.scanners ?? [];
  });

  useEffect(() => {
    setQuestions(translatedQuestions);
  }, [translatedQuestions]);

  const score: ScoreResult = useMemo(() => computeScore(questions, answers), [questions, answers]);

  const { risks, bestPractices }: RiskMappingResult = useMemo(
    () => mapRisks(score),
    [score]
  );

  // Migrate answers if schema changed
  useEffect(() => {
    if (needsMigration(answers)) {
      const migrated = migrateAnswers(answers);
      setAnswers(migrated);
      persist(ANSWERS_KEY, migrated);
    }
  }, []);

  // Initialize analytics once
  useEffect(() => {
    try {
      if (APP_CONFIG.analytics.enabled && APP_CONFIG.analytics.amplitudeApiKey) {
        amplitude.init(APP_CONFIG.analytics.amplitudeApiKey, undefined, {
          defaultTracking: true,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      persist(ANSWERS_KEY, next);
      return next;
    });
  };

  const resetAnswers = () => {
    setAnswers({});
    persist(ANSWERS_KEY, {});
  };

  const resetAll = () => {
    setAnswers({});
    setDomainScan(undefined);
    setDomainScanAggregate(undefined);
    setScannerProgress([]);
    persist(ANSWERS_KEY, {});
    persist(DOMAIN_KEY, undefined);
    persist(DOMAIN_AGG_KEY, undefined);
  };

  const runScanners = async (domain: string) => {
    // 1) Prefer cache if available
    const cached = scannerCache.get(domain);
    if (cached) {
      const normalized = normalizeDomainScanAggregate(cached) ?? cached;
      setDomainScanAggregate(normalized);
      setScannerProgress(normalized.scanners ?? []);
      persist(DOMAIN_AGG_KEY, normalized);
      return;
    }

    // 2) Initialize progress UI immediately
    setScannerProgress((prev) =>
      prev.map((p) =>
        p.id
          ? {
              ...p,
              status: 'running',
              startedAt: new Date().toISOString(),
            }
          : p
      )
    );

    // 3) Run scanners
    const agg = await runAllScanners(domain);

    // Defensive normalization (handles any older shapes from cache/import)
    const normalizedAgg = normalizeDomainScanAggregate(agg) ?? agg;

    setDomainScanAggregate(normalizedAgg);
    setScannerProgress(normalizedAgg.scanners ?? []);
    persist(DOMAIN_AGG_KEY, normalizedAgg);

    // Save to in-memory cache
    scannerCache.set(domain, normalizedAgg);

    // Track event safely (no `.issues.length` on undefined)
    trackEvent('domain_scan_complete', {
      domain,
      issues_count: (normalizedAgg.issues ?? []).length,
      scanners_count: (normalizedAgg.scanners ?? []).length,
    });
  };

  const exportJSON = () => {
    const payload = {
      answers,
      domainScan,
      domainScanAggregate,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    return JSON.stringify(payload, null, 2);
  };

  const importJSON = (json: string) => {
    try {
      const parsed = JSON.parse(json);
      const validation = validateImportJSON(parsed);
      if (!validation.success) return { success: false, error: validation.error };

      const obj = parsed as {
        answers?: Record<string, string>;
        domainScan?: DomainScanResult;
        domainScanAggregate?: DomainScanAggregate;
      };

      if (obj.answers) {
        setAnswers(obj.answers);
        persist(ANSWERS_KEY, obj.answers);
        trackImport('answers');
      }

      if (obj.domainScan) {
        setDomainScan(obj.domainScan);
        persist(DOMAIN_KEY, obj.domainScan);
        trackImport('domainScan');
      }

      if (obj.domainScanAggregate) {
        const normalized = normalizeDomainScanAggregate(obj.domainScanAggregate) ?? obj.domainScanAggregate;
        setDomainScanAggregate(normalized);
        setScannerProgress(normalized.scanners ?? []);
        persist(DOMAIN_AGG_KEY, normalized);
        trackImport('domainScanAggregate');
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
    }
  };

  const value: AppStateContextValue = {
    questions,
    answers,
    setAnswer,
    resetAnswers,
    resetAll,
    score,
    risks,
    bestPractices,
    domainScan,
    domainScanAggregate,
    scannerProgress,
    runScanners,
    exportJSON,
    importJSON,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
