import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as amplitude from '@amplitude/analytics-browser';

import questionsData from '../data/questions.json';
import { APP_CONFIG } from '../config/appConfig';
import { trackEvent } from '../utils/analytics';
import { migrateAnswers, needsMigration } from '../utils/migrations/answerMigration';
import { useTranslatedQuestions } from '../hooks/useTranslatedQuestions';
import { DomainScanAggregate, ExecutedScannerResult } from '../utils/domainscan';
import { runAllScanners } from '../utils/scanners';

interface RawQuestion {
  id: string;
  title: string;
  question: string;
  explanation?: string;
  options?: string[];
  defaultScore?: number;
}

interface AppStateContextType {
  questions: any[];
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  resetAnswers: () => void;

  runScanners: (domain: string) => Promise<void>;
  domainScanAggregate?: DomainScanAggregate;
  scannerProgress: ExecutedScannerResult[];
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

const ANSWERS_KEY = 'answers';
const DOMAIN_AGG_KEY = 'domainScanAggregate';

function persist<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
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

/**
 * ✅ Normalize aggregate objects so the UI + analytics never explode on missing fields
 */
function normalizeAggregate(agg?: DomainScanAggregate): DomainScanAggregate | undefined {
  if (!agg) return undefined;

  return {
    ...agg,
    scanners: Array.isArray(agg.scanners) ? agg.scanners : [],
    issues: Array.isArray(agg.issues) ? agg.issues : []
  };
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t, i18n } = useTranslation('questions');

  // Store raw questions data
  const rawQuestions = useMemo(() => {
    return (questionsData as { questions: RawQuestion[] }).questions;
  }, []);

  // Translate questions using i18n
  const questions = useTranslatedQuestions(rawQuestions);

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    return loadStored<Record<string, string>>(ANSWERS_KEY) || {};
  });

  const [migrationDone, setMigrationDone] = useState(false);

  // Perform migration after i18n is ready
  useEffect(() => {
    if (migrationDone || !i18n.isInitialized) return;

    const stored = answers;

    // Check if migration is needed
    if (Object.keys(stored).length > 0 && needsMigration(stored)) {
      const migrationResult = migrateAnswers(stored, rawQuestions, t);

      // Save migrated answers back to localStorage
      if (migrationResult.migratedCount > 0) {
        setAnswers(migrationResult.answers);
        persist(ANSWERS_KEY, migrationResult.answers);

        // Track migration for analytics
        trackEvent('answers_migrated', {
          migrated_count: migrationResult.migratedCount,
          unmatched_count: migrationResult.unmatchedCount
        });
      }
    }

    setMigrationDone(true);
  }, [i18n.isInitialized, migrationDone, answers, rawQuestions, t]);

  const [domainScanAggregate, setDomainScanAggregate] = useState<DomainScanAggregate | undefined>(() => {
    const stored = loadStored<DomainScanAggregate>(DOMAIN_AGG_KEY);
    return normalizeAggregate(stored);
  });

  const [scannerProgress, setScannerProgress] = useState<ExecutedScannerResult[]>([]);

  useEffect(() => {
    if (APP_CONFIG.amplitudeApiKey) {
      amplitude.init(APP_CONFIG.amplitudeApiKey, undefined, {
        autocapture: true,
        cookieOptions: { secure: true, upgrade: true },
        defaultTracking: true
      });
    }
  }, []);

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => {
      const updated = { ...prev, [id]: value };
      persist(ANSWERS_KEY, updated);
      trackEvent('answer_set', { question_id: id, value });
      return updated;
    });
  };

  const resetAnswers = () => {
    setAnswers({});
    try {
      localStorage.removeItem(ANSWERS_KEY);
    } catch {
      // ignore
    }
    trackEvent('answers_reset', {});
  };

  const runScanners = async (domain: string) => {
    // Start fresh progress list each scan
    setScannerProgress([]);

    // Run scanners and stream progress
    const aggRaw = await runAllScanners(domain, {
      onProgress: (next) => {
        setScannerProgress(next);
      }
    });

    // ✅ Normalize the aggregate so `issues` is always an array
    const agg = normalizeAggregate(aggRaw) as DomainScanAggregate;

    setDomainScanAggregate(agg);
    persist(DOMAIN_AGG_KEY, agg);

    // ✅ Defensive analytics (even though agg is normalized)
    trackEvent('domain_scanned_modular', {
      domain,
      issues_count: agg.issues?.length ?? 0,
      scanners_count: agg.scanners?.length ?? 0
    });
  };

  const value: AppStateContextType = {
    questions,
    answers,
    setAnswer,
    resetAnswers,
    runScanners,
    domainScanAggregate,
    scannerProgress
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
