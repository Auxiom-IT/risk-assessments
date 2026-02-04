import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  SCANNERS,
  runAllScanners,
  type DomainScanAggregate,
  type ExecutedScannerResult
} from '../utils/scanners';
import { applyAnswerMigration } from '../utils/answerMigration';

type Answers = Record<string, any>;

type AppState = {
  answers: Answers;
  setAnswer: (key: string, value: any) => void;
  resetAnswers: () => void;

  scannerProgress: ExecutedScannerResult[];
  domainScanAggregate: DomainScanAggregate | null;
  runScanners: (domain: string) => Promise<void>;
  resetDomainScan: () => void;

  exportJSON: () => string;
  importJSON: (json: string) => boolean;
};

const AppStateContext = createContext<AppState | null>(null);

const ANSWERS_KEY = 'risk_assessment_answers_v1';
const DOMAIN_AGG_KEY = 'risk_assessment_domain_scan_aggregate_v1';

const loadStored = (key: string, fallback: any) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const persist = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
};

// Defensive normalization for stored/imported domain scan aggregates.
// Older saved data may omit `issues` arrays which can crash UI rendering.
const normalizeDomainScanAggregate = (agg: unknown): DomainScanAggregate | null => {
  if (!agg || typeof agg !== 'object') return null;
  const a = agg as Partial<DomainScanAggregate> & { scanners?: unknown };

  const scanners = Array.isArray(a.scanners)
    ? (a.scanners as unknown[]).map((s) => {
        if (!s || typeof s !== 'object') return s as any;
        const sr = s as any;
        return {
          ...sr,
          issues: Array.isArray(sr.issues) ? sr.issues : []
        };
      })
    : [];

  return {
    domain: typeof a.domain === 'string' ? a.domain : '',
    timestamp: typeof a.timestamp === 'string' ? a.timestamp : new Date().toISOString(),
    scanners: scanners as DomainScanAggregate['scanners'],
    issues: Array.isArray(a.issues) ? a.issues : []
  };
};

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [answers, setAnswers] = useState<Answers>(() => {
    const stored = loadStored(ANSWERS_KEY, {});
    // Apply migration (handles older schema versions)
    return applyAnswerMigration(stored);
  });

  const [scannerProgress, setScannerProgress] = useState<ExecutedScannerResult[]>(() => {
    // initialize progress list for UI
    return SCANNERS.map((s) => ({
      id: s.id,
      label: s.label,
      status: 'idle',
      startedAt: new Date().toISOString()
    }));
  });

  const [domainScanAggregate, setDomainScanAggregate] = useState<DomainScanAggregate | null>(() => {
    const stored = loadStored(DOMAIN_AGG_KEY, null) as unknown;
    return normalizeDomainScanAggregate(stored);
  });

  const setAnswer = (key: string, value: any) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      persist(ANSWERS_KEY, next);
      return next;
    });
  };

  const resetAnswers = () => {
    setAnswers({});
    persist(ANSWERS_KEY, {});
  };

  const resetDomainScan = () => {
    setScannerProgress(
      SCANNERS.map((s) => ({
        id: s.id,
        label: s.label,
        status: 'idle',
        startedAt: new Date().toISOString()
      }))
    );
    setDomainScanAggregate(null);
    persist(DOMAIN_AGG_KEY, null);
  };

  const runScanners = async (domain: string) => {
    // If you had caching elsewhere that loads an old aggregate, normalize it before using.
    const cachedResult = null;
    if (cachedResult) {
      const normalizedCached = normalizeDomainScanAggregate(cachedResult) ?? cachedResult;
      setDomainScanAggregate(normalizedCached as DomainScanAggregate);
      persist(DOMAIN_AGG_KEY, normalizedCached);
      return;
    }

    // Reset UI progress immediately
    setScannerProgress(
      SCANNERS.map((s) => ({
        id: s.id,
        label: s.label,
        status: 'running',
        startedAt: new Date().toISOString()
      }))
    );

    const agg = await runAllScanners(domain, (update) => {
      setScannerProgress((prev) => {
        const idx = prev.findIndex((p) => p.id === update.id);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = update;
        return next;
      });
    });

    const normalizedAgg = normalizeDomainScanAggregate(agg) ?? agg;
    setDomainScanAggregate(normalizedAgg as DomainScanAggregate);
    persist(DOMAIN_AGG_KEY, normalizedAgg);
  };

  const exportJSON = () => {
    return JSON.stringify({
      answers,
      domainScanAggregate
    });
  };

  const importJSON = (json: string) => {
    try {
      const obj = JSON.parse(json);
      if (obj.answers && typeof obj.answers === 'object') {
        const migrated = applyAnswerMigration(obj.answers);
        setAnswers(migrated);
        persist(ANSWERS_KEY, migrated);
      }
      if (obj.domainScanAggregate) {
        const normalizedImportedAgg =
          normalizeDomainScanAggregate(obj.domainScanAggregate) ?? obj.domainScanAggregate;
        setDomainScanAggregate(normalizedImportedAgg as DomainScanAggregate);
        persist(DOMAIN_AGG_KEY, normalizedImportedAgg);
      }
      return true;
    } catch {
      return false;
    }
  };

  const value = useMemo<AppState>(
    () => ({
      answers,
      setAnswer,
      resetAnswers,
      scannerProgress,
      domainScanAggregate,
      runScanners,
      resetDomainScan,
      exportJSON,
      importJSON
    }),
    [answers, scannerProgress, domainScanAggregate]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
};
