/**
 * Answer migration utilities to handle backwards compatibility
 * when the answer format changed from full text to option IDs
 */

import { useTranslation } from 'react-i18next';
import { RawQuestion } from '../types/questions';

interface MigrationResult {
  answers: Record<string, string>;
  migratedCount: number;
  unmatchedCount: number;
}

/**
 * Migrate answers from old format (full text) to new format (option IDs)
 *
 * This function handles backwards compatibility when answers were stored as:
 * - Old: { "question_id": "Full text of the option" }
 * - New: { "question_id": "opt0" }
 *
 * It attempts to match old answer text against current translated option labels
 * to find the corresponding option ID.
 *
 * @param oldAnswers - Answers object that may contain old format (text) or new format (IDs)
 * @param rawQuestions - Raw question data with option IDs and points
 * @param t - Translation function from i18next (questions namespace)
 * @returns Migration result with converted answers and statistics
 */
export const migrateAnswers = (
  oldAnswers: Record<string, string>,
  rawQuestions: RawQuestion[],
  t: (key: string) => string
): MigrationResult => {
  const migratedAnswers: Record<string, string> = {};
  let migratedCount = 0;
  let unmatchedCount = 0;

  // Create a lookup map: questionId -> array of { optionId, translatedLabel }
  const questionOptionsMap = new Map<string, Array<{ id: string; label: string }>>();

  rawQuestions.forEach((q) => {
    if (!q.options) return;
    const questionPath = `questions.${q.id}`;
    const options = q.options.map((opt) => ({
      id: opt.id,
      label: t(`${questionPath}.options.${opt.id}.label`)
    }));
    questionOptionsMap.set(q.id, options);
  });

  // Process each answer
  Object.entries(oldAnswers).forEach(([questionId, answerValue]) => {
    const options = questionOptionsMap.get(questionId);

    if (!options) {
      // Question doesn't exist anymore - skip it
      unmatchedCount++;
      return;
    }

    // Check if answer is already in new format (starts with "opt")
    if (answerValue.startsWith('opt')) {
      const optionExists = options.some((opt) => opt.id === answerValue);
      if (optionExists) {
        migratedAnswers[questionId] = answerValue;
      } else {
        unmatchedCount++;
      }
      return;
    }

    // Answer is in old format (full text) - try to match it
    const matchedOption = options.find((opt) => {
      // Exact match
      if (opt.label === answerValue) return true;

      // Normalize text for comparison (case-insensitive, trimmed, normalized dashes and quotes)
      const normalizeText = (text: string) => {
        return text
          .toLowerCase()
          .trim()
          .replace(/[\u2013\u2014]/g, '-') // Replace en-dash and em-dash with hyphen
          .replace(/[\u2018\u2019]/g, '\'') // Replace smart quotes with regular quotes
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/\s+/g, ' '); // Normalize whitespace
      };

      const normalizedLabel = normalizeText(opt.label);
      const normalizedAnswer = normalizeText(answerValue);

      if (normalizedLabel === normalizedAnswer) return true;

      // Partial match (answer contains most of the label or vice versa)
      // This handles cases where text might have changed slightly
      if (normalizedLabel.length > 20 && normalizedAnswer.length > 20) {
        // For longer text, check if they share significant overlap
        const minLength = Math.min(normalizedLabel.length, normalizedAnswer.length);
        const threshold = minLength * 0.8; // 80% similarity

        if (normalizedLabel.includes(normalizedAnswer.substring(0, Math.floor(threshold))) ||
            normalizedAnswer.includes(normalizedLabel.substring(0, Math.floor(threshold)))) {
          return true;
        }
      }

      return false;
    });

    if (matchedOption) {
      migratedAnswers[questionId] = matchedOption.id;
      migratedCount++;
    } else {
      // Could not match - don't include in migrated answers
      unmatchedCount++;
    }
  });

  return {
    answers: migratedAnswers,
    migratedCount,
    unmatchedCount
  };
};

/**
 * Hook to get migration function with current translations
 * Use this in components that need to migrate answers
 */
export const useMigrateAnswers = () => {
  const { t } = useTranslation('questions');

  return (oldAnswers: Record<string, string>, rawQuestions: RawQuestion[]): MigrationResult => {
    return migrateAnswers(oldAnswers, rawQuestions, t);
  };
};

/**
 * Validate if answers object needs migration
 * Returns true if any answer values are not in the "optN" format
 */
export const needsMigration = (answers: Record<string, string>): boolean => {
  return Object.values(answers).some((value) => !value.startsWith('opt'));
};
