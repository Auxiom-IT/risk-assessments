// Setup i18n for tests
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import English translations for tests
import commonEN from '../i18n/locales/en/common.json';
import questionsEN from '../i18n/locales/en/questions.json';
import scannersEN from '../i18n/locales/en/scanners.json';

// Initialize i18n for testing
i18n
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    debug: false,
    resources: {
      en: {
        common: commonEN,
        questions: questionsEN,
        scanners: scannersEN,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
