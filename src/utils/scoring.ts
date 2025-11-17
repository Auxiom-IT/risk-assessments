import { Question } from '../types/questions';

export interface CategoryScore {
  category: string;
  total: number; // points earned
  max: number;   // maximum possible
  percent: number; // 0-100
}

export interface ScoreResult {
  total: number;
  max: number;
  percent: number;
  categories: CategoryScore[];
}

export const computeScore = (answers: Record<string, string>, questions: Question[]): ScoreResult => {
  let total = 0;
  let max = 0;
  const categoryScoreMap: Record<string, { total: number; max: number; displayName: string }> = {};

  for (const q of questions) {
    const questionMax = Math.max(...q.options.map((o) => o.points));
    max += questionMax;
    const key = q.categoryKey ?? q.category; // Use categoryKey for grouping
    if (!categoryScoreMap[key]) categoryScoreMap[key] = { total: 0, max: 0, displayName: q.category };
    categoryScoreMap[key].max += questionMax;

    const chosen = answers[q.id];
    if (chosen) {
      const opt = q.options.find((o) => o.value === chosen);
      if (opt) {
        total += opt.points;
        categoryScoreMap[key].total += opt.points;
      }
    }
  }

  const categories: CategoryScore[] = Object.entries(categoryScoreMap).map(([_key, v]) => ({
    category: v.displayName,
    total: v.total,
    max: v.max,
    percent: v.max === 0 ? 0 : +(100 * v.total / v.max).toFixed(2)
  }));

  return {
    total,
    max,
    percent: max === 0 ? 0 : +(100 * total / max).toFixed(2),
    categories
  };
};
