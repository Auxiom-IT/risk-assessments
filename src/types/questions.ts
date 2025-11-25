export interface RawOption {
  id: string;
  option?: string;
  risk?: string;
  points?: number;
}
export interface RawQuestion {
  id: string;
  text: string;
  category: string;
  recommendationMap?: Record<string, string[]>;
  options?: RawOption[];
}
export interface AnswerOption {
  label: string;
  value: string;
  risk: string;
  points: number; // Raw point contribution for this answer
}

export interface Question {
  id: string; // Unique stable id (snake_case recommended)
  text: string; // Human readable question text
  category: string; // Translated category name for display
  categoryKey: string; // Original untranslated category for grouping
  options: AnswerOption[]; // Dropdown options
}

export interface QuestionnaireData {
  questions: Question[];
}
