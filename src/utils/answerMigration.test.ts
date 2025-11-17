import { describe, it, expect } from 'vitest';
import { migrateAnswers, needsMigration } from './answerMigration';
import { RawQuestion } from '../types/questions';

describe('answerMigration', () => {
  // Mock translation function
  const mockTranslate = (key: string): string => {
    const translations: Record<string, string> = {
      'questions.q1.options.opt0.label': 'No formal policies exist',
      'questions.q1.options.opt1.label': 'Draft policies exist',
      'questions.q1.options.opt2.label': 'Approved policies exist',
      'questions.q2.options.opt0.label': 'MFA is not enforced',
      'questions.q2.options.opt1.label': 'MFA is enforced for remote access',
      'questions.q2.options.opt2.label': 'MFA is enforced for all access',
    };
    return translations[key] || key;
  };

  const mockRawQuestions: RawQuestion[] = [
    {
      id: 'q1',
      text: 'Test question 1',
      category: 'test_category',
      options: [
        { id: 'opt0', points: 0 },
        { id: 'opt1', points: 50 },
        { id: 'opt2', points: 100 },
      ],
    },
    {
      id: 'q2',
      text: 'Test question 2',
      category: 'test_category',
      options: [
        { id: 'opt0', points: 0 },
        { id: 'opt1', points: 50 },
        { id: 'opt2', points: 100 },
      ],
    },
  ];

  describe('needsMigration', () => {
    it('returns false for empty answers', () => {
      expect(needsMigration({})).toBe(false);
    });

    it('returns false when all answers are in new format', () => {
      const answers = {
        q1: 'opt0',
        q2: 'opt1',
      };
      expect(needsMigration(answers)).toBe(false);
    });

    it('returns true when any answer is in old format', () => {
      const answers = {
        q1: 'opt0',
        q2: 'No formal policies exist',
      };
      expect(needsMigration(answers)).toBe(true);
    });

    it('returns true when all answers are in old format', () => {
      const answers = {
        q1: 'No formal policies exist',
        q2: 'MFA is not enforced',
      };
      expect(needsMigration(answers)).toBe(true);
    });
  });

  describe('migrateAnswers', () => {
    it('keeps answers that are already in new format', () => {
      const oldAnswers = {
        q1: 'opt0',
        q2: 'opt1',
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
        q2: 'opt1',
      });
      expect(result.migratedCount).toBe(0);
      expect(result.unmatchedCount).toBe(0);
    });

    it('migrates exact text matches', () => {
      const oldAnswers = {
        q1: 'No formal policies exist',
        q2: 'MFA is enforced for remote access',
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
        q2: 'opt1',
      });
      expect(result.migratedCount).toBe(2);
      expect(result.unmatchedCount).toBe(0);
    });

    it('migrates case-insensitive matches', () => {
      const oldAnswers = {
        q1: 'NO FORMAL POLICIES EXIST',
        q2: 'mfa is enforced for remote access',
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
        q2: 'opt1',
      });
      expect(result.migratedCount).toBe(2);
      expect(result.unmatchedCount).toBe(0);
    });

    it('migrates trimmed matches', () => {
      const oldAnswers = {
        q1: '  No formal policies exist  ',
        q2: '\\tMFA is enforced for remote access\\n',
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers.q1).toBe('opt0');
      expect(result.migratedCount).toBeGreaterThan(0);
    });

    it('handles unicode dash variations (en-dash, em-dash)', () => {
      const dashTranslate = (key: string): string => {
        const translations: Record<string, string> = {
          'questions.q1.options.opt0.label': 'Review within 12-24 months', // Regular dash
          'questions.q1.options.opt1.label': 'Review within 6-12 months',
        };
        return translations[key] || key;
      };

      const questions: RawQuestion[] = [
        {
          id: 'q1',
          text: 'Test question',
          category: 'test_category',
          options: [
            { id: 'opt0', points: 0 },
            { id: 'opt1', points: 100 },
          ],
        },
      ];

      const oldAnswers = {
        q1: 'Review within 12–24 months', // En-dash (Unicode U+2013)
      };

      const result = migrateAnswers(oldAnswers, questions, dashTranslate);

      expect(result.answers.q1).toBe('opt0');
      expect(result.migratedCount).toBe(1);
    });

    it('handles mixed old and new format answers', () => {
      const oldAnswers = {
        q1: 'opt0', // Already new format
        q2: 'MFA is enforced for remote access', // Old format
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
        q2: 'opt1',
      });
      expect(result.migratedCount).toBe(1);
      expect(result.unmatchedCount).toBe(0);
    });

    it('skips answers for non-existent questions', () => {
      const oldAnswers = {
        q1: 'No formal policies exist',
        q999: 'Some answer', // Question doesn't exist
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
      });
      expect(result.migratedCount).toBe(1);
      expect(result.unmatchedCount).toBe(1);
    });

    it('skips answers that cannot be matched', () => {
      const oldAnswers = {
        q1: 'No formal policies exist',
        q2: 'Some completely different text that does not match',
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
      });
      expect(result.migratedCount).toBe(1);
      expect(result.unmatchedCount).toBe(1);
    });

    it('skips invalid option IDs in new format', () => {
      const oldAnswers = {
        q1: 'opt0',
        q2: 'opt999', // Invalid option ID
      };

      const result = migrateAnswers(oldAnswers, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({
        q1: 'opt0',
      });
      expect(result.unmatchedCount).toBe(1);
    });

    it('handles empty answers object', () => {
      const result = migrateAnswers({}, mockRawQuestions, mockTranslate);

      expect(result.answers).toEqual({});
      expect(result.migratedCount).toBe(0);
      expect(result.unmatchedCount).toBe(0);
    });
  });
});
