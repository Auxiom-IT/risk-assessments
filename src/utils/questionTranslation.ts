import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { Question, RawQuestion, RawOption } from '../types/questions';

/**
 * Hook to translate questions from the raw question data
 * Maps translation keys to localized strings using nested structure
 */
export const useTranslatedQuestions = (rawQuestions: RawQuestion[]): Question[] => {
  const { t } = useTranslation('questions');

  return useMemo(() => {
    return rawQuestions.map((q) => {
      // Use nested path for question text
      const questionPath = `questions.${q.id}`;

      return {
        id: q.id,
        text: t(`${questionPath}.text`, q.text),
        category: t(`categories.${q.category}`, q.category),
        categoryKey: q.category, // Preserve original for grouping
        recommendationMap: q.recommendationMap,
        options: (q.options || [])
          .sort((a: RawOption, b: RawOption) => ((a?.points || 0) - (b?.points || 0)))
          .map((o) => ({
            label: t(`${questionPath}.options.${o.id}.label`, o.option || ''),
            value: o.id, // Use option ID for stable answer matching across languages
            risk: t(`${questionPath}.options.${o.id}.risk`, o.risk || ''),
            points: o.points ?? 0
          }))
      };
    });
  }, [rawQuestions, t]);
};

/**
 * Utility to convert category name to translation key
 */
export const getCategoryTranslationKey = (category: string): string => {
  return `cat.${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
};
