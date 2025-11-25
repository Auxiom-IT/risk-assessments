/**
 * Test version management in import/export
 */

import { describe, it, expect } from 'vitest';
import { validateImportJSON } from './importValidation';

describe('Version Management', () => {
  describe('Export Format', () => {
    it('should include version 2 in exports', () => {
      const exportData = {
        version: 2,
        answers: { 'q1': 'opt0' },
        risks: [],
        bestPractices: []
      };

      const json = JSON.stringify(exportData);
      const validation = validateImportJSON(json);

      expect(validation.isValid).toBe(true);
    });
  });

  describe('Import Version Detection', () => {
    it('should accept v1 format (no version field)', () => {
      const v1Data = {
        answers: { 'q1': 'No formal policies exist' },
        risks: [],
        bestPractices: []
      };

      const json = JSON.stringify(v1Data);
      const validation = validateImportJSON(json);

      expect(validation.isValid).toBe(true);
    });

    it('should accept v1 format with explicit version', () => {
      const v1Data = {
        version: 1,
        answers: { 'q1': 'No formal policies exist' },
        risks: [],
        bestPractices: []
      };

      const json = JSON.stringify(v1Data);
      const validation = validateImportJSON(json);

      expect(validation.isValid).toBe(true);
    });

    it('should accept v2 format', () => {
      const v2Data = {
        version: 2,
        answers: { 'q1': 'opt0' },
        risks: [],
        bestPractices: []
      };

      const json = JSON.stringify(v2Data);
      const validation = validateImportJSON(json);

      expect(validation.isValid).toBe(true);
    });

    it('should reject invalid version numbers', () => {
      const invalidData = {
        version: 99,
        answers: { 'q1': 'opt0' }
      };

      const json = JSON.stringify(invalidData);
      const validation = validateImportJSON(json);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Unsupported version');
    });

    it('should reject non-numeric version', () => {
      const invalidData = {
        version: '2',
        answers: { 'q1': 'opt0' }
      };

      const json = JSON.stringify(invalidData);
      const validation = validateImportJSON(json);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Version must be a number');
    });
  });
});
