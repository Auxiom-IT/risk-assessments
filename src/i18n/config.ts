import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEN from './locales/en/common.json';
import questionsEN from './locales/en/questions.json';
import scannersEN from './locales/en/scanners.json';

import commonES from './locales/es/common.json';
import questionsES from './locales/es/questions.json';
import scannersES from './locales/es/scanners.json';

const resources = {
  en: {
    common: commonEN,
    questions: questionsEN,
    scanners: scannersEN,
  },
  es: {
    common: commonES,
    questions: questionsES,
    scanners: scannersES,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'questions', 'scanners'],
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
